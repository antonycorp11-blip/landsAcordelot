import { BUILD, WORKFORCE } from '../config/balance';
import { BUILDING_DEFS } from '../data/defs';
import {
  RESOURCE_KINDS,
  type Building,
  type BuildingKind,
  type GameState,
  type Kingdom,
  type ResourceBag,
  type Territory,
} from '../types';
import type { EconomyManager } from './EconomyManager';

export interface BuildCheck {
  ok: boolean;
  reason: string;
  cost: Partial<ResourceBag>;
  time: number;
}

let counter = 0;
const nextId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${(counter++).toString(36)}`;

/**
 * BuildingManager — construção, evolução e alocação de mão de obra.
 * Toda ação valida custo e pré-requisito antes de mexer no estado.
 */
export class BuildingManager {
  constructor(
    private state: GameState,
    private economy: EconomyManager,
  ) {}

  costFor(defId: BuildingKind, level: number): Partial<ResourceBag> {
    const def = BUILDING_DEFS[defId];
    const mult = Math.pow(BUILD.levelCostMult, Math.max(0, level - 1));
    const out: Partial<ResourceBag> = {};
    for (const k of RESOURCE_KINDS) {
      const v = def.cost[k];
      if (v) out[k] = Math.round(v * mult);
    }
    return out;
  }

  timeFor(defId: BuildingKind, level: number): number {
    const def = BUILDING_DEFS[defId];
    return Math.round(def.buildTime * Math.pow(BUILD.levelTimeMult, Math.max(0, level - 1)));
  }

  canAfford(kingdom: Kingdom, cost: Partial<ResourceBag>): boolean {
    return RESOURCE_KINDS.every((k) => (cost[k] ?? 0) <= kingdom.resources[k] + 1e-6);
  }

  pay(kingdom: Kingdom, cost: Partial<ResourceBag>, sign = -1) {
    for (const k of RESOURCE_KINDS) {
      if (cost[k]) kingdom.resources[k] = Math.max(0, kingdom.resources[k] + cost[k]! * sign);
    }
  }

  /**
   * Toda ação de administração exige que o território pertença a quem age.
   * O ator padrão é o jogador; a IA passa o próprio reino. Sem isso a UI
   * poderia mexer na economia alheia (e, no futuro, na de outro jogador).
   */
  private ownedBy(territoryId: string, actor?: string): boolean {
    const owner = this.state.territories[territoryId]?.ownerId;
    return owner !== null && owner === (actor ?? this.state.playerKingdomId);
  }

  /** Vagas urbanas ainda livres (oficinas e prédios cívicos). */
  freeCitySlots(t: Territory): number {
    const used = t.buildingIds.filter((id) => this.state.buildings[id]?.depositId === null).length;
    return Math.max(0, t.citySlots.length - used);
  }

  checkBuild(t: Territory, defId: BuildingKind, depositId?: string, actor?: string): BuildCheck {
    const def = BUILDING_DEFS[defId];
    const cost = this.costFor(defId, 1);
    const time = this.timeFor(defId, 1);
    const fail = (reason: string): BuildCheck => ({ ok: false, reason, cost, time });

    if (!def) return fail('Construção desconhecida.');
    if (!this.ownedBy(t.id, actor)) return fail('Território não é seu.');

    if (def.deposit) {
      if (!depositId) return fail('Escolha um depósito no mapa.');
      const dep = this.state.deposits[depositId];
      if (!dep || dep.territoryId !== t.id) return fail('Depósito inválido.');
      if (dep.kind !== def.deposit) return fail('Depósito de tipo errado.');
      if (dep.buildingId) return fail('Depósito já ocupado.');
    } else if (this.freeCitySlots(t) <= 0) {
      return fail('Sem espaço urbano — evolua o castelo ou conquiste mais terra.');
    }

    const kingdom = t.ownerId ? this.state.kingdoms[t.ownerId] : null;
    if (!kingdom || !this.canAfford(kingdom, cost)) return fail('Recursos insuficientes.');
    return { ok: true, reason: 'Pronto para construir.', cost, time };
  }

  build(territoryId: string, defId: BuildingKind, depositId?: string, actor?: string): Building | null {
    const t = this.state.territories[territoryId];
    if (!t || !t.ownerId) return null;
    const check = this.checkBuild(t, defId, depositId, actor);
    if (!check.ok) return null;

    const kingdom = this.state.kingdoms[t.ownerId];
    this.pay(kingdom, check.cost);

    let position = t.center;
    if (depositId) {
      position = this.state.deposits[depositId].position;
    } else {
      const used = new Set(
        t.buildingIds
          .map((id) => this.state.buildings[id])
          .filter((b) => b && b.depositId === null)
          .map((b) => `${Math.round(b!.position.x)},${Math.round(b!.position.y)}`),
      );
      const slot = t.citySlots.find((s) => !used.has(`${Math.round(s.x)},${Math.round(s.y)}`));
      if (!slot) return null;
      position = slot;
    }

    const building: Building = {
      id: nextId('bld'),
      defId,
      territoryId,
      depositId: depositId ?? null,
      position,
      level: 0,
      targetLevel: 1,
      workers: 0,
      construction: check.time,
      efficiency: 0,
    };
    this.state.buildings[building.id] = building;
    t.buildingIds.push(building.id);
    if (depositId) this.state.deposits[depositId].buildingId = building.id;
    return building;
  }

  checkUpgrade(b: Building): BuildCheck {
    const def = BUILDING_DEFS[b.defId];
    const level = b.level + 1;
    const cost = this.costFor(b.defId, level);
    const time = this.timeFor(b.defId, level);
    const t = this.state.territories[b.territoryId];
    if (b.construction > 0) return { ok: false, reason: 'Obra em andamento.', cost, time };
    if (b.level >= def.maxLevel) return { ok: false, reason: 'Nível máximo.', cost, time };
    if (!t?.ownerId) return { ok: false, reason: 'Território sem dono.', cost, time };
    const kingdom = this.state.kingdoms[t.ownerId];
    if (!this.canAfford(kingdom, cost)) {
      return { ok: false, reason: 'Recursos insuficientes.', cost, time };
    }
    return { ok: true, reason: 'Pronto para evoluir.', cost, time };
  }

  upgrade(buildingId: string, actor?: string): boolean {
    const b = this.state.buildings[buildingId];
    if (!b || !this.ownedBy(b.territoryId, actor)) return false;
    const check = this.checkUpgrade(b);
    if (!check.ok) return false;
    const t = this.state.territories[b.territoryId];
    this.pay(this.state.kingdoms[t.ownerId!], check.cost);
    b.targetLevel = b.level + 1;
    b.construction = check.time;
    return true;
  }

  demolish(buildingId: string, actor?: string): boolean {
    const b = this.state.buildings[buildingId];
    if (!b || !this.ownedBy(b.territoryId, actor)) return false;
    const t = this.state.territories[b.territoryId];
    if (!t?.ownerId) return false;
    const refund = this.costFor(b.defId, Math.max(1, b.level));
    for (const k of RESOURCE_KINDS) {
      if (refund[k]) refund[k] = Math.round(refund[k]! * BUILD.refundRatio);
    }
    this.pay(this.state.kingdoms[t.ownerId], refund, +1);
    if (b.depositId && this.state.deposits[b.depositId]) {
      this.state.deposits[b.depositId].buildingId = null;
    }
    t.buildingIds = t.buildingIds.filter((id) => id !== buildingId);
    delete this.state.buildings[buildingId];
    return true;
  }

  // -- mão de obra ----------------------------------------------------------

  hireCost(): number {
    return WORKFORCE.hireCost;
  }

  canHire(t: Territory, actor?: string): { ok: boolean; reason: string } {
    if (!this.ownedBy(t.id, actor)) return { ok: false, reason: 'Território não é seu.' };
    const pool = this.economy.laborPool(t);
    const soldiers = this.economy.soldiersOf(t.id);
    if (t.hiredWorkers + soldiers >= pool) {
      return { ok: false, reason: 'Sem habitantes disponíveis — faça a população crescer.' };
    }
    const kingdom = t.ownerId ? this.state.kingdoms[t.ownerId] : null;
    if (!kingdom || kingdom.resources.coin < WORKFORCE.hireCost) {
      return { ok: false, reason: 'Ouro insuficiente para contratar.' };
    }
    return { ok: true, reason: 'Disponível.' };
  }

  hireWorker(territoryId: string, actor?: string): boolean {
    const t = this.state.territories[territoryId];
    if (!t) return false;
    if (!this.canHire(t, actor).ok) return false;
    this.state.kingdoms[t.ownerId!].resources.coin -= WORKFORCE.hireCost;
    t.hiredWorkers += 1;
    return true;
  }

  dismissWorker(territoryId: string, actor?: string): boolean {
    const t = this.state.territories[territoryId];
    if (!t || !this.ownedBy(territoryId, actor)) return false;
    const employed = t.buildingIds.reduce((a, id) => a + (this.state.buildings[id]?.workers ?? 0), 0);
    if (t.hiredWorkers <= employed) return false;
    t.hiredWorkers -= 1;
    return true;
  }

  /** Aloca (+1) ou libera (-1) um trabalhador de um prédio. */
  assignWorker(buildingId: string, delta: number, actor?: string): boolean {
    const b = this.state.buildings[buildingId];
    if (!b || !this.ownedBy(b.territoryId, actor)) return false;
    const t = this.state.territories[b.territoryId];
    const def = BUILDING_DEFS[b.defId];
    if (!t || !def) return false;
    const maxJobs = def.jobsPerLevel * Math.max(1, b.level);
    if (delta > 0) {
      const employed = t.buildingIds.reduce((a, id) => a + (this.state.buildings[id]?.workers ?? 0), 0);
      if (employed >= t.hiredWorkers) return false;
      if (b.workers >= maxJobs) return false;
      b.workers += 1;
      return true;
    }
    if (b.workers <= 0) return false;
    b.workers -= 1;
    return true;
  }
}
