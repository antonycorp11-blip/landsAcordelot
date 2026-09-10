import { SAVE } from '../config/balance';
import { STATE_VERSION } from '../state';
import type { Army, Battle, Building, GameState, TrainingOrder } from '../types';
import { readSave, removeSave, requestPersistence, writeSave } from './storage';

/**
 * SaveManager — save local (§44).
 *
 * A geometria do mundo NÃO é salva: é reconstruída deterministicamente a partir
 * da seed. O save guarda apenas o que a simulação mudou, o que mantém o arquivo
 * pequeno e compatível com um backend futuro.
 */

interface SavedTerritory {
  ownerId: string | null;
  ownerKind: GameState['territories'][string]['ownerKind'];
  population: number;
  hiredWorkers: number;
  happiness: number;
  loyalty: number;
  stability: number;
  defense: number;
  level: number;
  locked: boolean;
  buildingIds: string[];
  vocation?: GameState['territories'][string]['vocation'];
}

interface SavePayload {
  version: number;
  savedAt: number;
  time: GameState['time'];
  playerKingdomId: string;
  tutorialStep: number;
  tutorialDone: boolean;
  stats?: GameState['stats'];
  waves?: number;
  titleIndex?: number;
  chronicle?: string[];
  stage?: GameState['stage'];
  stateName?: string | null;
  governorId?: string | null;
  generalId?: string | null;
  civilPolicy?: GameState['civilPolicy'];
  warPolicy?: GameState['warPolicy'];
  resources: Record<string, GameState['kingdoms'][string]['resources']>;
  territories: Record<string, SavedTerritory>;
  castles: Record<string, { level: number; hp: number }>;
  buildings: Record<string, Building>;
  depositBuildings: Record<string, string | null>;
  armies: Record<string, Army>;
  battles: Record<string, Battle>;
  training: TrainingOrder[];
}

export class SaveManager {
  private timer = 0;
  /** Último save lido do disco, guardado para o `load` continuar síncrono. */
  private cached: string | null = null;
  /** Save de versão anterior encontrado e arquivado, se houver. */
  incompatibleFound = false;
  persistent = false;
  lastSavedAt = 0;

  /**
   * Lê o disco uma vez e pede armazenamento durável. Precisa ser chamado antes
   * do primeiro `load`.
   */
  async init(): Promise<void> {
    this.persistent = await requestPersistence();
    this.cached = await readSave(SAVE.key);
    if (this.cached) this.lastSavedAt = savedAtOf(this.cached);
  }

  hasSave(): boolean {
    return this.cached !== null;
  }

  save(state: GameState): boolean {
    const payload: SavePayload = {
      version: STATE_VERSION,
      savedAt: Date.now(),
      time: state.time,
      playerKingdomId: state.playerKingdomId,
      tutorialStep: state.tutorialStep,
      tutorialDone: state.tutorialDone,
      stats: state.stats,
      waves: state.waves,
      titleIndex: state.titleIndex,
      chronicle: state.chronicle,
      stage: state.stage,
      stateName: state.stateName,
      governorId: state.governorId,
      generalId: state.generalId,
      civilPolicy: state.civilPolicy,
      warPolicy: state.warPolicy,
      resources: {},
      territories: {},
      castles: {},
      buildings: {},
      depositBuildings: {},
      armies: {},
      battles: {},
      training: state.training,
    };

    for (const k of Object.values(state.kingdoms)) payload.resources[k.id] = { ...k.resources };
    for (const t of Object.values(state.territories)) {
      payload.territories[t.id] = {
        ownerId: t.ownerId,
        ownerKind: t.ownerKind,
        population: t.population,
        hiredWorkers: t.hiredWorkers,
        happiness: t.happiness,
        loyalty: t.loyalty,
        stability: t.stability,
        defense: t.defense,
        level: t.level,
        locked: t.locked,
        vocation: t.vocation,
        buildingIds: [...t.buildingIds],
      };
    }
    for (const c of Object.values(state.castles)) payload.castles[c.id] = { level: c.level, hp: c.hp };
    for (const b of Object.values(state.buildings)) payload.buildings[b.id] = b;
    for (const d of Object.values(state.deposits)) payload.depositBuildings[d.id] = d.buildingId;
    for (const a of Object.values(state.armies)) payload.armies[a.id] = a;
    for (const b of Object.values(state.battles)) payload.battles[b.id] = b;

    // Guarda a versão anterior ANTES de trocar o cache: uma gravação ruim não
    // pode levar junto o progresso inteiro.
    const previous = this.cached;
    const json = JSON.stringify(payload);
    this.cached = json;
    this.lastSavedAt = payload.savedAt;
    void writeSave(SAVE.key, json).then((ok) => {
      if (ok && previous) void writeSave(`${SAVE.key}:backup`, previous);
    });
    return true;
  }

  /**
   * Em que escala o save foi gravado, sem aplicar nada.
   *
   * O mundo precisa crescer ANTES de o save entrar: se as províncias do País
   * ainda não existem no estado, o `load` as ignora e uma conquista sua além
   * da fronteira volta calada para o dono antigo.
   */
  peekWaves(): number {
    if (!this.cached) return 0;
    try {
      const payload = JSON.parse(this.cached) as SavePayload;
      if (payload.version !== STATE_VERSION) return 0;
      return payload.waves ?? 0;
    } catch {
      return 0;
    }
  }

  /** Aplica um save sobre um estado recém-construído. */
  load(state: GameState): boolean {
    const raw = this.cached;
    if (!raw) return false;

    let payload: SavePayload;
    try {
      payload = JSON.parse(raw) as SavePayload;
    } catch {
      return false;
    }
    if (payload.version !== STATE_VERSION) {
      // O formato mudou. Em vez de apagar o progresso do jogador, arquivamos
      // com a versão no nome — dá para resgatar depois se valer a pena.
      this.incompatibleFound = true;
      void writeSave(`${SAVE.key}:v${payload.version}`, raw);
      this.cached = null;
      return false;
    }

    state.time = payload.time ?? state.time;
    if (state.time.speed === 0) state.time.speed = 1;
    state.tutorialStep = payload.tutorialStep ?? 0;
    state.tutorialDone = payload.tutorialDone ?? false;
    // Campos novos não existem em saves anteriores: entram com o padrão.
    if (payload.stats) state.stats = { ...state.stats, ...payload.stats };
    state.titleIndex = payload.titleIndex ?? 0;
    state.chronicle = payload.chronicle ?? [];
    state.stage = payload.stage ?? 'kingdom';
    state.waves = payload.waves ?? 0;
    state.stateName = payload.stateName ?? null;
    state.governorId = payload.governorId ?? null;
    state.generalId = payload.generalId ?? null;
    state.civilPolicy = payload.civilPolicy ?? 'celeiros';
    state.warPolicy = payload.warPolicy ?? 'fronteira';
    state.promotionPending = false;

    for (const [id, res] of Object.entries(payload.resources ?? {})) {
      if (state.kingdoms[id]) state.kingdoms[id].resources = { ...res };
    }
    for (const [id, t] of Object.entries(payload.territories ?? {})) {
      const target = state.territories[id];
      if (!target) continue;
      Object.assign(target, t);
      target.vocation = t.vocation ?? 'balanced';
    }
    for (const [id, c] of Object.entries(payload.castles ?? {})) {
      const target = state.castles[id];
      if (!target) continue;
      target.level = c.level;
      target.hp = c.hp;
    }

    // Construções e exércitos são recriados por completo.
    state.buildings = {};
    for (const [id, b] of Object.entries(payload.buildings ?? {})) state.buildings[id] = b;
    for (const [id, bid] of Object.entries(payload.depositBuildings ?? {})) {
      if (state.deposits[id]) state.deposits[id].buildingId = bid;
    }
    state.armies = {};
    for (const [id, a] of Object.entries(payload.armies ?? {})) {
      // Saneamento: contagem de tropa é sempre inteira.
      for (const kind of Object.keys(a.units) as (keyof typeof a.units)[]) {
        const n = Math.max(0, Math.round(a.units[kind] ?? 0));
        if (n > 0) a.units[kind] = n;
        else delete a.units[kind];
      }
      state.armies[id] = a;
    }
    state.battles = {};
    for (const [id, b] of Object.entries(payload.battles ?? {})) state.battles[id] = b;
    // Ordens de treino antigas não tinham `count` (uma ordem = um soldado).
    state.training = (payload.training ?? []).map((o) => ({
      ...o,
      count: typeof o.count === 'number' && o.count > 0 ? Math.floor(o.count) : 1,
    }));

    // Coerência: descarta referências órfãs vindas de saves antigos.
    for (const t of Object.values(state.territories)) {
      t.buildingIds = t.buildingIds.filter((id) => state.buildings[id]);
    }
    // Um depósito só continua ocupado se a construção existir e apontar de
    // volta para ele. Sem isso um vínculo velho trava o depósito para sempre.
    for (const d of Object.values(state.deposits)) {
      if (!d.buildingId) continue;
      const b = state.buildings[d.buildingId];
      if (!b || b.depositId !== d.id) d.buildingId = null;
    }
    // E uma construção órfã de depósito também não pode ficar pendurada.
    for (const b of Object.values(state.buildings)) {
      if (!b.depositId) continue;
      const d = state.deposits[b.depositId];
      if (!d) {
        delete state.buildings[b.id];
        const t = state.territories[b.territoryId];
        if (t) t.buildingIds = t.buildingIds.filter((id) => id !== b.id);
      }
    }
    return true;
  }

  clear() {
    this.cached = null;
    this.lastSavedAt = 0;
    void removeSave(SAVE.key);
  }

  /** Save atual como texto, para o jogador guardar fora do navegador. */
  export(state: GameState): string {
    this.save(state);
    return this.cached ?? '';
  }

  /** Restaura a partir de um texto exportado. Não aplica: só troca o cache. */
  importFrom(text: string): boolean {
    try {
      const payload = JSON.parse(text) as SavePayload;
      if (typeof payload.version !== 'number') return false;
      this.cached = text;
      void writeSave(SAVE.key, text);
      return true;
    } catch {
      return false;
    }
  }

  tick(dt: number, state: GameState) {
    this.timer += dt;
    if (this.timer >= SAVE.autosaveEverySeconds) {
      this.timer = 0;
      this.save(state);
    }
  }
}

function savedAtOf(raw: string): number {
  try {
    const v = (JSON.parse(raw) as { savedAt?: number }).savedAt;
    return typeof v === 'number' ? v : 0;
  } catch {
    return 0;
  }
}
