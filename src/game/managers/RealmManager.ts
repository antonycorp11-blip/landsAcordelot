import { CIVIL_POLICIES, RENOWN, TITLES, WAR_POLICIES } from '../config/balance';
import generalsRaw from '../data/generals.json';
import governorsRaw from '../data/governors.json';
import { LORE } from '../data/defs';
import type { GameState } from '../types';

export interface TitleInfo {
  index: number;
  name: string;
  scale: string;
  renown: number;
  nextName: string | null;
  nextAt: number | null;
  progress: number;
}

/** Conselheiro: governador cuida da cidade, general cuida da tropa. */
export interface AdvisorDef {
  id: string;
  portrait: string;
  /** Carta ilustrada, quando existir arte dedicada. */
  card?: string;
  name: string;
  trait: string;
  hint: string;
  bonus: Record<string, number>;
}

export const GOVERNORS = governorsRaw as unknown as AdvisorDef[];
export const GENERALS = generalsRaw as unknown as AdvisorDef[];

export interface ChronicleEntry {
  id: string;
  title: string;
  text: string;
}

/**
 * RealmManager — renome, título e crônica.
 *
 * O renome é DERIVADO do que existe no mundo: terras, gente, construções,
 * batalhas. Não é uma barra que enche sozinha com o tempo — é o retrato do que
 * o jogador realmente fez. E cada título devolve algo concreto, senão seria
 * só um nome bonito na barra (§5).
 */
export class RealmManager {
  constructor(private state: GameState) {}

  renown(): number {
    const s = this.state.stats;
    let total =
      s.battlesWon * RENOWN.perBattleWon +
      s.territoriesTaken * RENOWN.perTerritoryTaken +
      s.unitsTrained * RENOWN.perUnitTrained;

    for (const t of Object.values(this.state.territories)) {
      if (t.ownerId !== this.state.playerKingdomId) continue;
      total += RENOWN.perTerritory;
      total += t.population * RENOWN.perPopulation;
      total += t.buildingIds.length * RENOWN.perBuilding;
      const castle = t.castleId ? this.state.castles[t.castleId] : null;
      if (castle) total += castle.level * RENOWN.perCastleLevel;
    }
    return Math.max(0, Math.round(total));
  }

  title(): TitleInfo {
    const renown = this.renown();
    let index = 0;
    for (let i = 0; i < TITLES.length; i++) {
      if (renown >= TITLES[i].renown) index = i;
    }
    const current = TITLES[index];
    const next = TITLES[index + 1] ?? null;
    const span = next ? next.renown - current.renown : 1;
    return {
      index,
      name: current.name,
      scale: current.scale,
      renown,
      nextName: next?.name ?? null,
      nextAt: next?.renown ?? null,
      progress: next ? Math.min(1, (renown - current.renown) / span) : 1,
    };
  }

  /**
   * Bônus somado: título do reino, conselheiros e as ordens dadas a eles.
   * Tudo que a progressão promete tem que sair daqui — senão é enfeite.
   */
  bonus() {
    const t = TITLES[Math.min(this.state.titleIndex, TITLES.length - 1)];
    const isState = this.state.stage === 'state';
    const gov = isState ? this.governor()?.bonus ?? {} : {};
    const gen = isState ? this.general()?.bonus ?? {} : {};
    const civil = isState ? CIVIL_POLICIES[this.state.civilPolicy] : null;
    const war = isState ? WAR_POLICIES[this.state.warPolicy] : null;

    const n = (v: number | undefined, fallback = 0) => (typeof v === 'number' ? v : fallback);

    return {
      storage: t.storage,
      wageCut: t.wageCut + n(gov.wageCut),
      morale: t.morale + n(gen.morale) + (war?.morale ?? 0),
      claimCut: Math.min(0.6, t.claimCut + (war?.claimCut ?? 0)),
      production: n(gov.production, 1) * (civil?.production ?? 1) * (war?.production ?? 1),
      trainSpeed: n(gen.trainSpeed, 1) * (war?.trainSpeed ?? 1),
      marchSpeed: n(gen.marchSpeed, 1),
      defense: n(gen.defense) + (war?.defense ?? 0),
      upkeepCut: n(gen.upkeepCut),
      tradeSpread: n(gov.tradeSpread),
      stability: (civil?.stability ?? 0) + (war?.stability ?? 0) + n(gov.stability),
      happiness: (civil?.happiness ?? 0) + n(gov.happiness),
      growth: n(gov.growth, 1) * (civil?.growth ?? 1),
    };
  }

  governor(): AdvisorDef | null {
    return GOVERNORS.find((g) => g.id === this.state.governorId) ?? null;
  }

  general(): AdvisorDef | null {
    return GENERALS.find((g) => g.id === this.state.generalId) ?? null;
  }

  /** Todo o mapa jogável sob uma só bandeira? Então é hora do Estado (§5). */
  shouldPromoteToState(): boolean {
    if (this.state.stage !== 'kingdom') return false;
    const all = Object.values(this.state.territories);
    return all.length > 0 && all.every((t) => t.ownerId === this.state.playerKingdomId);
  }

  /** Funda o Estado com nome, conselheiros e as duas ordens escolhidas. */
  foundState(
    name: string,
    governorId: string,
    generalId: string,
    civilPolicy: GameState['civilPolicy'],
    warPolicy: GameState['warPolicy'],
  ) {
    this.state.stage = 'state';
    this.state.stateName = name.trim() || 'Acordelot';
    this.state.governorId = governorId;
    this.state.generalId = generalId;
    this.state.civilPolicy = civilPolicy;
    this.state.warPolicy = warPolicy;
    this.state.promotionPending = false;
    this.record('state_founded');
  }

  /** Sobe de título se o renome já alcançou o próximo degrau. */
  checkPromotion(): TitleInfo | null {
    const info = this.title();
    if (info.index <= this.state.titleIndex) return null;
    this.state.titleIndex = info.index;
    return info;
  }

  // -- crônica --------------------------------------------------------------

  entry(id: string): ChronicleEntry | null {
    return LORE.chronicle.find((c) => c.id === id) ?? null;
  }

  unlocked(): ChronicleEntry[] {
    return this.state.chronicle
      .map((id) => this.entry(id))
      .filter((e): e is ChronicleEntry => Boolean(e));
  }

  /** Registra uma entrada, se ainda não foi vista. Devolve o que abriu. */
  record(id: string): ChronicleEntry | null {
    if (this.state.chronicle.includes(id)) return null;
    const entry = this.entry(id);
    if (!entry) return null;
    this.state.chronicle.push(id);
    return entry;
  }

  /**
   * Marcos que dependem só de olhar o mundo. Os que dependem de um evento
   * (batalha vencida, caravana enviada) são registrados por quem os causa.
   */
  checkMilestones(): ChronicleEntry[] {
    const opened: ChronicleEntry[] = [];
    const mine = Object.values(this.state.territories).filter(
      (t) => t.ownerId === this.state.playerKingdomId,
    );

    const has = (kinds: string[]) =>
      Object.values(this.state.buildings).some(
        (b) =>
          kinds.includes(b.defId) &&
          b.construction === 0 &&
          this.state.territories[b.territoryId]?.ownerId === this.state.playerKingdomId,
      );

    const push = (id: string) => {
      const e = this.record(id);
      if (e) opened.push(e);
    };

    if (mine.some((t) => t.buildingIds.length > 2)) push('first_building');
    if (has(['sawmill', 'brickworks', 'foundry', 'mint'])) push('first_refinery');
    if (this.state.kingdoms[this.state.playerKingdomId].resources.coin > 600 && has(['mint'])) {
      push('first_gold');
    }
    if (mine.length >= 5) push('five_territories');

    return opened;
  }
}
