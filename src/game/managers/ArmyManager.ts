import { MARCH, MILITARY, VOCATIONS } from '../config/balance';
import { BUILDING_DEFS, UNIT_DEFS } from '../data/defs';
import {
  RESOURCE_KINDS,
  type Army,
  type TrainingOrder,
  type GameState,
  type ResourceBag,
  type Territory,
  type UnitKind,
  type Vec2,
} from '../types';
import type { BuiltWorld } from '../world/WorldBuilder';
import type { EconomyManager } from './EconomyManager';

export interface RecruitCheck {
  ok: boolean;
  reason: string;
  /** Custo do lote inteiro. */
  cost: Partial<ResourceBag>;
  /** Segundos até o lote inteiro ficar pronto. */
  time: number;
  /** Quantos cabem de fato, entre recursos e gente disponível. */
  max: number;
}

export interface MarchCheck {
  ok: boolean;
  reason: string;
  cost: { coin: number; food: number };
  /** Segundos estimados de viagem. */
  travelTime: number;
  distance: number;
}

export type UnitStack = Partial<Record<UnitKind, number>>;

let counter = 0;
const nextId = (p: string) => `${p}_${Date.now().toString(36)}_${(counter++).toString(36)}`;

export function stackSize(units: UnitStack): number {
  let n = 0;
  for (const k of Object.keys(units) as UnitKind[]) n += units[k] ?? 0;
  return n;
}

/**
 * ArmyManager — recrutamento, exércitos como GRUPOS e marcha (§15/§16).
 *
 * Um exército é uma composição com moral, suprimento e posição no mapa.
 * Marchar custa ouro e comida, leva tempo proporcional à distância e só é
 * permitido para territórios que fazem fronteira (§6).
 */
export class ArmyManager {
  /** Rotas prontas entre pares de territórios vizinhos. */
  private routes = new Map<string, Vec2[]>();

  constructor(
    private state: GameState,
    private economy: EconomyManager,
    private world: BuiltWorld,
  ) {
    for (const road of world.roads) {
      this.routes.set(`${road.a}|${road.b}`, road.points);
      this.routes.set(`${road.b}|${road.a}`, [...road.points].reverse());
    }
  }

  // -- consultas ------------------------------------------------------------

  barracksLevel(t: Territory): number {
    let level = 0;
    for (const id of t.buildingIds) {
      const b = this.state.buildings[id];
      if (!b || b.construction > 0) continue;
      if (BUILDING_DEFS[b.defId]?.enablesRecruit) level = Math.max(level, b.level);
    }
    return level;
  }

  /** Guarnição estacionada — o exército que defende o território. */
  garrisonOf(territoryId: string): Army | null {
    return (
      Object.values(this.state.armies).find(
        (a) => a.territoryId === territoryId && a.state === 'garrison',
      ) ?? null
    );
  }

  armiesOf(kingdomId: string): Army[] {
    return Object.values(this.state.armies).filter((a) => a.ownerId === kingdomId);
  }

  marchingArmies(kingdomId?: string): Army[] {
    return Object.values(this.state.armies).filter(
      (a) => a.state !== 'garrison' && (!kingdomId || a.ownerId === kingdomId),
    );
  }

  totalUnits(army: Army | null): number {
    return army ? stackSize(army.units) : 0;
  }

  /** Poder aproximado — usado pela UI, pela IA e pela prévia de batalha. */
  power(army: Army | null): number {
    if (!army) return 0;
    return Math.round(this.stackPower(army.units) * (0.5 + army.morale / 200));
  }

  stackPower(units: UnitStack): number {
    let p = 0;
    for (const kind of Object.keys(units) as UnitKind[]) {
      const def = UNIT_DEFS[kind];
      if (def) p += (def.attack + def.defense) * 0.5 * (units[kind] ?? 0);
    }
    return p;
  }

  /** Posição padrão da guarnição: ao lado do castelo. */
  garrisonPosition(territoryId: string): Vec2 {
    const t = this.state.territories[territoryId];
    const castle = t?.castleId ? this.state.castles[t.castleId] : null;
    const anchor = castle?.position ?? t?.center ?? { x: 0, y: 0 };
    return { x: anchor.x + 120, y: anchor.y + 54 };
  }

  // -- recrutamento ---------------------------------------------------------

  /**
   * Quantos soldados deste tipo cabem agora, olhando recursos e habitantes.
   * É o que alimenta o botão "Máx" — o jogador não precisa fazer a conta.
   */
  maxRecruitable(t: Territory, unit: UnitKind, actor?: string): number {
    const def = UNIT_DEFS[unit];
    if (!t.ownerId || t.ownerId !== (actor ?? this.state.playerKingdomId)) return 0;
    const level = this.barracksLevel(t);
    if (level <= 0 || level < def.requiresBarracks) return 0;

    const kingdom = this.state.kingdoms[t.ownerId];
    let byResources: number = MILITARY.maxPerOrder;
    for (const k of RESOURCE_KINDS) {
      const unitCost = def.cost[k] ?? 0;
      if (unitCost > 0) byResources = Math.min(byResources, Math.floor(kingdom.resources[k] / unitCost));
    }

    const pool = this.economy.laborPool(t);
    const soldiers = this.economy.soldiersOf(t.id);
    const queued = this.state.training
      .filter((o) => o.territoryId === t.id)
      .reduce((a, o) => a + UNIT_DEFS[o.unit].manpower * o.count, 0);
    const freeManpower = pool - soldiers - queued - t.hiredWorkers;
    const byPeople = Math.floor(Math.max(0, freeManpower) / def.manpower);

    return Math.max(0, Math.min(byResources, byPeople, MILITARY.maxPerOrder));
  }

  checkRecruit(t: Territory, unit: UnitKind, count = 1, actor?: string): RecruitCheck {
    const def = UNIT_DEFS[unit];
    const n = Math.max(1, Math.floor(count));
    const cost: Partial<ResourceBag> = {};
    for (const k of RESOURCE_KINDS) {
      if (def.cost[k]) cost[k] = def.cost[k]! * n;
    }
    const time = def.trainTime * n;
    const max = this.maxRecruitable(t, unit, actor);
    const fail = (reason: string): RecruitCheck => ({ ok: false, reason, cost, time, max });

    if (!t.ownerId) return fail('Território sem dono.');
    if (t.ownerId !== (actor ?? this.state.playerKingdomId)) return fail('Território não é seu.');
    const level = this.barracksLevel(t);
    if (level <= 0) return fail('Construa um Quartel primeiro.');
    if (level < def.requiresBarracks) return fail(`Exige Quartel nível ${def.requiresBarracks}.`);
    if (max <= 0) {
      const kingdom = this.state.kingdoms[t.ownerId];
      const semRecurso = RESOURCE_KINDS.some((k) => (def.cost[k] ?? 0) > kingdom.resources[k]);
      return fail(semRecurso ? 'Recursos insuficientes.' : 'Sem habitantes disponíveis para as armas.');
    }
    if (n > max) return fail(`Cabem no máximo ${max} agora.`);

    return { ok: true, reason: `${n} em treinamento.`, cost, time, max };
  }

  recruit(territoryId: string, unit: UnitKind, count = 1, actor?: string): boolean {
    const t = this.state.territories[territoryId];
    if (!t) return false;
    const n = Math.max(1, Math.floor(count));
    const check = this.checkRecruit(t, unit, n, actor);
    if (!check.ok) return false;

    const kingdom = this.state.kingdoms[t.ownerId!];
    for (const k of RESOURCE_KINDS) {
      if (check.cost[k]) kingdom.resources[k] = Math.max(0, kingdom.resources[k] - check.cost[k]!);
    }
    // Praça de armas treina mais rápido.
    const speed = (VOCATIONS[t.vocation] ?? VOCATIONS.balanced).trainSpeed;
    const each = Math.max(3, Math.round(UNIT_DEFS[unit].trainTime * speed));
    this.state.training.push({
      id: nextId('trn'),
      territoryId,
      unit,
      count: n,
      remaining: each,
      total: each,
    });
    return true;
  }

  cancelTraining(orderId: string): boolean {
    const idx = this.state.training.findIndex((o) => o.id === orderId);
    if (idx < 0) return false;
    const order = this.state.training[idx];
    if (this.state.territories[order.territoryId]?.ownerId !== this.state.playerKingdomId) {
      return false;
    }
    const t = this.state.territories[order.territoryId];
    const def = UNIT_DEFS[order.unit];
    if (t?.ownerId) {
      const kingdom = this.state.kingdoms[t.ownerId];
      // Metade de volta pelo que ainda não virou soldado.
      for (const k of RESOURCE_KINDS) {
        if (def.cost[k]) kingdom.resources[k] += def.cost[k]! * order.count * 0.5;
      }
    }
    this.state.training.splice(idx, 1);
    return true;
  }

  /** Cria ou devolve a guarnição do território. */
  ensureGarrison(territoryId: string): Army | null {
    const t = this.state.territories[territoryId];
    if (!t?.ownerId) return null;
    const existing = this.garrisonOf(territoryId);
    if (existing) return existing;
    const army: Army = {
      id: nextId('army'),
      name: `Guarnição de ${t.name}`,
      ownerId: t.ownerId,
      territoryId,
      units: {},
      morale: MILITARY.startingMorale + (VOCATIONS[t.vocation] ?? VOCATIONS.balanced).morale,
      state: 'garrison',
      position: this.garrisonPosition(territoryId),
      path: null,
      pathDistance: 0,
      pathLength: 0,
      targetTerritoryId: null,
      homeTerritoryId: territoryId,
      supplies: 0,
      battleId: null,
    };
    this.state.armies[army.id] = army;
    return army;
  }

  disband(territoryId: string, unit: UnitKind): boolean {
    if (this.state.territories[territoryId]?.ownerId !== this.state.playerKingdomId) return false;
    const army = this.garrisonOf(territoryId);
    if (!army || !army.units[unit]) return false;
    army.units[unit] = (army.units[unit] ?? 0) - 1;
    if (army.units[unit]! <= 0) delete army.units[unit];
    if (this.totalUnits(army) === 0) delete this.state.armies[army.id];
    return true;
  }

  // -- marcha ---------------------------------------------------------------

  routeBetween(from: string, to: string): Vec2[] {
    const cached = this.routes.get(`${from}|${to}`);
    if (cached && cached.length > 1) return cached;
    // Sem estrada: linha reta entre as âncoras (acontece em terreno bruto).
    const a = this.world.anchors[from] ?? this.state.territories[from]?.center;
    const b = this.world.anchors[to] ?? this.state.territories[to]?.center;
    return a && b ? [a, b] : [];
  }

  static pathLength(points: Vec2[]): number {
    let d = 0;
    for (let i = 1; i < points.length; i++) {
      d += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    }
    return d;
  }

  /** Velocidade da coluna: manda a unidade mais lenta (§16). */
  marchSpeed(units: UnitStack): number {
    let slowest = Infinity;
    for (const kind of Object.keys(units) as UnitKind[]) {
      if ((units[kind] ?? 0) <= 0) continue;
      slowest = Math.min(slowest, UNIT_DEFS[kind].speed);
    }
    if (!Number.isFinite(slowest)) slowest = 1;
    return MARCH.baseSpeed * slowest;
  }

  checkMarch(fromId: string, toId: string, units: UnitStack, actor?: string): MarchCheck {
    const from = this.state.territories[fromId];
    const to = this.state.territories[toId];
    const size = stackSize(units);
    const route = this.routeBetween(fromId, toId);
    const distance = ArmyManager.pathLength(route);
    const travelTime = distance / Math.max(1, this.marchSpeed(units));
    const cost = {
      coin: Math.round(size * MARCH.mobilizeCoinPerUnit * (1 + distance / 2600)),
      food: Math.round(size * MARCH.mobilizeFoodPerUnit * (1 + distance / 2600)),
    };
    const fail = (reason: string): MarchCheck => ({ ok: false, reason, cost, travelTime, distance });

    if (!from?.ownerId || !to) return fail('Território inválido.');
    if (from.ownerId !== (actor ?? this.state.playerKingdomId)) return fail('Território não é seu.');
    if (size <= 0) return fail('Escolha ao menos uma unidade.');
    if (!from.neighbors.includes(toId)) return fail('SEM FRONTEIRA DIRETA');
    if (to.locked) return fail(to.lockReason ?? 'Região inacessível.');
    if (route.length < 2) return fail('Sem rota conhecida.');

    const garrison = this.garrisonOf(fromId);
    if (!garrison) return fail('Nenhuma tropa neste território.');
    for (const kind of Object.keys(units) as UnitKind[]) {
      if ((units[kind] ?? 0) > (garrison.units[kind] ?? 0)) return fail('Tropas insuficientes.');
    }

    const kingdom = this.state.kingdoms[from.ownerId];
    if (kingdom.resources.coin < cost.coin) return fail('Ouro insuficiente para mobilizar.');
    if (kingdom.resources.food < cost.food) return fail('Comida insuficiente para a marcha.');

    return { ok: true, reason: 'Coluna pronta para partir.', cost, travelTime, distance };
  }

  /** Destaca as unidades da guarnição e coloca a coluna na estrada. */
  dispatch(fromId: string, toId: string, units: UnitStack, actor?: string): Army | null {
    const check = this.checkMarch(fromId, toId, units, actor);
    if (!check.ok) return null;

    const from = this.state.territories[fromId];
    const garrison = this.garrisonOf(fromId)!;
    const kingdom = this.state.kingdoms[from.ownerId!];
    kingdom.resources.coin -= check.cost.coin;
    kingdom.resources.food -= check.cost.food;

    for (const kind of Object.keys(units) as UnitKind[]) {
      const n = units[kind] ?? 0;
      if (n <= 0) continue;
      garrison.units[kind] = (garrison.units[kind] ?? 0) - n;
      if (garrison.units[kind]! <= 0) delete garrison.units[kind];
    }
    if (this.totalUnits(garrison) === 0) delete this.state.armies[garrison.id];

    const route = this.routeBetween(fromId, toId);
    const size = stackSize(units);
    const army: Army = {
      id: nextId('army'),
      name: `Expedição de ${from.name}`,
      ownerId: from.ownerId!,
      territoryId: fromId,
      units: { ...units },
      morale: Math.max(35, garrison.morale),
      state: 'marching',
      position: { ...route[0] },
      path: route,
      pathDistance: 0,
      pathLength: ArmyManager.pathLength(route),
      targetTerritoryId: toId,
      homeTerritoryId: fromId,
      supplies: size * MARCH.suppliesPerUnit,
      battleId: null,
    };
    this.state.armies[army.id] = army;
    return army;
  }

  /** Manda a coluna voltar para casa. */
  recall(armyId: string): boolean {
    const army = this.state.armies[armyId];
    if (!army || army.state === 'fighting') return false;
    if (army.state === 'garrison') return false;
    const route = this.routeBetween(army.targetTerritoryId ?? army.homeTerritoryId, army.homeTerritoryId);
    army.state = 'returning';
    army.targetTerritoryId = army.homeTerritoryId;
    // Continua da posição atual: rota nova a partir daqui.
    army.path = [{ ...army.position }, ...route.slice(1)];
    army.pathLength = ArmyManager.pathLength(army.path);
    army.pathDistance = 0;
    return true;
  }

  /** Junta uma coluna à guarnição do território onde parou. */
  mergeIntoGarrison(army: Army, territoryId: string) {
    const garrison = this.ensureGarrison(territoryId);
    if (!garrison) {
      // Território não é mais do reino: a coluna some do mapa.
      delete this.state.armies[army.id];
      return;
    }
    if (garrison.id === army.id) {
      army.state = 'garrison';
      army.territoryId = territoryId;
      army.position = this.garrisonPosition(territoryId);
      army.path = null;
      army.targetTerritoryId = null;
      army.battleId = null;
      return;
    }
    for (const kind of Object.keys(army.units) as UnitKind[]) {
      garrison.units[kind] = (garrison.units[kind] ?? 0) + (army.units[kind] ?? 0);
    }
    const a = this.totalUnits(army);
    const g = this.totalUnits(garrison);
    garrison.morale = g > 0 ? (garrison.morale * (g - a) + army.morale * a) / g : army.morale;
    delete this.state.armies[army.id];
  }

  // -- simulação ------------------------------------------------------------

  /**
   * Avança a fila de treino. Devolve o que ficou pronto e onde.
   *
   * O quartel tem baias: o nível dele define quantas ordens correm ao mesmo
   * tempo naquele território. Antes todas avançavam juntas e a fila não era
   * fila — pedir doze milícias entregava as doze de uma vez.
   */
  tickTraining(dtSeconds: number): { unit: UnitKind; territoryId: string; ownerId: string }[] {
    const finished: { unit: UnitKind; territoryId: string; ownerId: string }[] = [];

    const byTerritory = new Map<string, TrainingOrder[]>();
    for (const order of this.state.training) {
      const list = byTerritory.get(order.territoryId);
      if (list) list.push(order);
      else byTerritory.set(order.territoryId, [order]);
    }

    for (const [territoryId, orders] of byTerritory) {
      const t = this.state.territories[territoryId];
      if (!t?.ownerId) continue;
      const bays = Math.max(1, this.barracksLevel(t));

      for (const order of orders.slice(0, bays)) {
        order.remaining -= dtSeconds;
        // Um passo grande pode terminar mais de um soldado de uma vez.
        while (order.remaining <= 0 && order.count > 0) {
          const army = this.ensureGarrison(territoryId);
          if (!army) break;
          army.units[order.unit] = (army.units[order.unit] ?? 0) + 1;
          finished.push({ unit: order.unit, territoryId, ownerId: t.ownerId });
          order.count -= 1;
          if (order.count > 0) order.remaining += order.total;
        }
      }
    }

    this.state.training = this.state.training.filter((o) => o.count > 0);
    return finished;
  }

  /**
   * Move as colunas. Devolve as que chegaram ao destino, para o Game decidir
   * entre juntar à guarnição ou abrir batalha.
   */
  tickMovement(dtSeconds: number): Army[] {
    const arrivals: Army[] = [];
    const minutes = dtSeconds / 60;

    for (const army of Object.values(this.state.armies)) {
      if (army.state === 'garrison') {
        if (army.morale < MILITARY.startingMorale) {
          army.morale = Math.min(
            MILITARY.startingMorale,
            army.morale + MARCH.moraleRecoveryPerMinute * minutes,
          );
        }
        continue;
      }
      if (army.state === 'fighting' || !army.path || army.path.length < 2) continue;

      const size = stackSize(army.units);
      if (size <= 0) {
        delete this.state.armies[army.id];
        continue;
      }

      // Suprimento: acabou, a moral cai (§16).
      const burn = size * MARCH.supplyBurnPerUnitPerMinute * minutes;
      if (army.supplies > 0) {
        army.supplies = Math.max(0, army.supplies - burn);
      } else {
        army.morale = Math.max(0, army.morale - MARCH.starvedMoraleLossPerMinute * minutes);
      }

      army.pathDistance += this.marchSpeed(army.units) * dtSeconds;
      const t = Math.min(1, army.pathDistance / Math.max(1, army.pathLength));
      army.position = pointAlong(army.path, t);

      if (t >= 1) arrivals.push(army);
    }
    return arrivals;
  }
}

/** Ponto a `t` (0..1) do comprimento de uma polilinha. */
export function pointAlong(points: Vec2[], t: number): Vec2 {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return { ...points[0] };
  const total = ArmyManager.pathLength(points);
  let target = total * Math.max(0, Math.min(1, t));
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (target <= seg || i === points.length - 1) {
      const u = seg > 0 ? target / seg : 0;
      return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
    }
    target -= seg;
  }
  return { ...points[points.length - 1] };
}
