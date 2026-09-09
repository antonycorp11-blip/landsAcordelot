import { SAVE } from '../config/balance';
import { STATE_VERSION } from '../state';
import type { Army, Battle, Building, GameState, TrainingOrder } from '../types';

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
}

interface SavePayload {
  version: number;
  savedAt: number;
  time: GameState['time'];
  playerKingdomId: string;
  tutorialStep: number;
  tutorialDone: boolean;
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

  hasSave(): boolean {
    try {
      return localStorage.getItem(SAVE.key) !== null;
    } catch {
      return false;
    }
  }

  save(state: GameState): boolean {
    const payload: SavePayload = {
      version: STATE_VERSION,
      savedAt: Date.now(),
      time: state.time,
      playerKingdomId: state.playerKingdomId,
      tutorialStep: state.tutorialStep,
      tutorialDone: state.tutorialDone,
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
        buildingIds: [...t.buildingIds],
      };
    }
    for (const c of Object.values(state.castles)) payload.castles[c.id] = { level: c.level, hp: c.hp };
    for (const b of Object.values(state.buildings)) payload.buildings[b.id] = b;
    for (const d of Object.values(state.deposits)) payload.depositBuildings[d.id] = d.buildingId;
    for (const a of Object.values(state.armies)) payload.armies[a.id] = a;
    for (const b of Object.values(state.battles)) payload.battles[b.id] = b;

    try {
      localStorage.setItem(SAVE.key, JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  /** Aplica um save sobre um estado recém-construído. */
  load(state: GameState): boolean {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(SAVE.key);
    } catch {
      return false;
    }
    if (!raw) return false;

    let payload: SavePayload;
    try {
      payload = JSON.parse(raw) as SavePayload;
    } catch {
      return false;
    }
    if (payload.version !== STATE_VERSION) return false;

    state.time = payload.time ?? state.time;
    if (state.time.speed === 0) state.time.speed = 1;
    state.tutorialStep = payload.tutorialStep ?? 0;
    state.tutorialDone = payload.tutorialDone ?? false;

    for (const [id, res] of Object.entries(payload.resources ?? {})) {
      if (state.kingdoms[id]) state.kingdoms[id].resources = { ...res };
    }
    for (const [id, t] of Object.entries(payload.territories ?? {})) {
      const target = state.territories[id];
      if (!target) continue;
      Object.assign(target, t);
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
    state.training = payload.training ?? [];

    // Coerência: descarta referências órfãs vindas de saves antigos.
    for (const t of Object.values(state.territories)) {
      t.buildingIds = t.buildingIds.filter((id) => state.buildings[id]);
    }
    return true;
  }

  clear() {
    try {
      localStorage.removeItem(SAVE.key);
    } catch {
      /* ignora */
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
