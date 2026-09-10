import { RENOWN, TITLES } from '../config/balance';
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

  /** Bônus acumulado do título atual. */
  bonus() {
    const t = TITLES[Math.min(this.state.titleIndex, TITLES.length - 1)];
    return { storage: t.storage, wageCut: t.wageCut, morale: t.morale, claimCut: t.claimCut };
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
