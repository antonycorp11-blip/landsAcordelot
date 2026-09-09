import type { ConquestReason, GameState, KingdomId, Territory, TerritoryId } from '../types';

/**
 * TerritoryManager — regras de território e fronteira.
 *
 * A regra do §6 vive aqui: só se disputa território que faz fronteira com o
 * domínio atual. A troca de dono passa SEMPRE por `transferOwnership`, que
 * aceita um motivo — guerra é apenas um deles (§19).
 */
export class TerritoryManager {
  constructor(private state: GameState) {}

  get(id: TerritoryId): Territory | undefined {
    return this.state.territories[id];
  }

  all(): Territory[] {
    return Object.values(this.state.territories);
  }

  ownedBy(kingdomId: KingdomId): Territory[] {
    return this.all().filter((t) => t.ownerId === kingdomId);
  }

  /** Territórios que fazem fronteira com o domínio do reino informado. */
  frontierOf(kingdomId: KingdomId): Set<TerritoryId> {
    const out = new Set<TerritoryId>();
    for (const t of this.ownedBy(kingdomId)) {
      for (const n of t.neighbors) {
        const nt = this.state.territories[n];
        if (nt && nt.ownerId !== kingdomId) out.add(n);
      }
    }
    return out;
  }

  hasBorderWith(kingdomId: KingdomId, targetId: TerritoryId): boolean {
    const target = this.state.territories[targetId];
    if (!target) return false;
    return target.neighbors.some((n) => this.state.territories[n]?.ownerId === kingdomId);
  }

  /** Resultado legível para a UI: pode disputar? por quê não? */
  claimStatus(
    kingdomId: KingdomId,
    targetId: TerritoryId,
  ): { claimable: boolean; reason: string } {
    const target = this.state.territories[targetId];
    if (!target) return { claimable: false, reason: 'Território desconhecido.' };
    if (target.ownerId === kingdomId) return { claimable: false, reason: 'Já é seu.' };
    if (target.locked) {
      return { claimable: false, reason: target.lockReason ?? 'Região inacessível.' };
    }
    if (!this.hasBorderWith(kingdomId, targetId)) {
      return { claimable: false, reason: 'SEM FRONTEIRA DIRETA' };
    }
    return { claimable: true, reason: 'Fronteira estabelecida.' };
  }

  /**
   * Única porta de entrada para mudança de dono. Guerra, diplomacia, religião,
   * rebelião e vassalagem passarão todos por aqui.
   */
  transferOwnership(
    territoryId: TerritoryId,
    newOwner: KingdomId | null,
    reason: ConquestReason,
  ): boolean {
    const t = this.state.territories[territoryId];
    if (!t) return false;
    const kingdom = newOwner ? this.state.kingdoms[newOwner] : null;
    t.ownerId = newOwner;
    t.ownerKind = kingdom ? kingdom.ownerKind : 'NEUTRAL';

    // Conquista não deixa a cidade perfeita (§62) — a penalidade depende do motivo.
    if (reason === 'MILITARY') {
      t.happiness = Math.max(10, t.happiness - 25);
      t.loyalty = 15;
      t.stability = Math.max(10, t.stability - 30);
    } else if (reason === 'DIPLOMATIC' || reason === 'VASSALIZATION') {
      t.loyalty = 45;
      t.stability = Math.max(20, t.stability - 10);
    } else if (reason === 'REBELLION') {
      t.loyalty = 55;
      t.happiness = Math.min(100, t.happiness + 10);
    }
    return true;
  }

  /** Desbloqueia regiões cujo pré-requisito (dominar os vizinhos) foi cumprido (§4). */
  refreshLocks(kingdomId: KingdomId): TerritoryId[] {
    const unlocked: TerritoryId[] = [];
    for (const t of this.all()) {
      if (!t.locked) continue;
      const accessible = t.neighbors.filter((n) => this.state.territories[n]);
      if (accessible.length > 0 && accessible.every((n) => this.state.territories[n].ownerId === kingdomId)) {
        t.locked = false;
        t.lockReason = undefined;
        unlocked.push(t.id);
      }
    }
    return unlocked;
  }
}
