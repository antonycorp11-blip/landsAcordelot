import { BUILD, CASTLE_LEVEL_YIELD_MULT, ECONOMY, TIME, WORKFORCE } from '../config/balance';
import { BUILDING_DEFS, UNIT_DEFS } from '../data/defs';
import {
  addBag,
  emptyBag,
  RESOURCE_KINDS,
  type Building,
  type GameState,
  type KingdomId,
  type ResourceBag,
  type ResourceKind,
  type Territory,
} from '../types';

/** Relatório econômico de um território — alimenta a UI e a simulação. */
export interface TerritoryReport {
  /** Produção bruta por minuto (antes do consumo das oficinas). */
  gross: ResourceBag;
  /** Consumo por minuto das oficinas. */
  inputs: ResourceBag;
  /** Saldo por minuto já descontando insumos, salários, comida e tropas. */
  net: ResourceBag;
  jobs: number;
  employed: number;
  laborPool: number;
  idleWorkers: number;
  housing: number;
  storage: number;
  wages: number;
  taxes: number;
  foodUpkeep: number;
  soldiers: number;
  armyUpkeep: ResourceBag;
}

/**
 * EconomyManager — a cadeia produtiva.
 *
 * Nada produz sozinho: um prédio precisa estar construído, ter trabalhadores
 * alocados e, se for refinaria, receber insumo. É isso que transforma o mapa
 * em um jogo de gestão em vez de um contador que sobe.
 */
export class EconomyManager {
  private accumulator = 0;

  constructor(private state: GameState) {}

  // -- consultas ------------------------------------------------------------

  /** Multiplicador de produção do prédio: nível, equipe, riqueza, moral. */
  buildingScale(b: Building, t: Territory): number {
    const def = BUILDING_DEFS[b.defId];
    if (!def || b.construction > 0) return 0;
    const jobs = def.jobsPerLevel * b.level;
    if (jobs <= 0) return 0;
    const staff = Math.min(1, b.workers / jobs);
    if (staff <= 0) return WORKFORCE.idleEfficiency;

    const deposit = b.depositId ? this.state.deposits[b.depositId] : null;
    const richness = deposit?.richness ?? 1;
    const castle = t.castleId ? this.state.castles[t.castleId] : null;
    const castleMult = CASTLE_LEVEL_YIELD_MULT[castle?.level ?? 1] ?? 1;
    const mood = 0.65 + (t.happiness / 100) * 0.25 + (t.stability / 100) * 0.1;
    return b.level * BUILD.levelOutputMult * staff * richness * castleMult * mood;
  }

  laborPool(t: Territory): number {
    return Math.floor(t.population / WORKFORCE.populationPerWorker);
  }

  housingOf(t: Territory): number {
    let housing = (t.castleId ? this.state.castles[t.castleId].level : 1) * ECONOMY.baseHousingPerLevel;
    for (const id of t.buildingIds) {
      const b = this.state.buildings[id];
      const def = b && BUILDING_DEFS[b.defId];
      if (b && def?.housing && b.construction === 0) housing += def.housing * b.level;
    }
    return housing;
  }

  storageOf(t: Territory): number {
    let storage = t.castleId ? this.state.castles[t.castleId].storage : 0;
    for (const id of t.buildingIds) {
      const b = this.state.buildings[id];
      const def = b && BUILDING_DEFS[b.defId];
      if (b && def?.storage && b.construction === 0) storage += def.storage * b.level;
    }
    return storage;
  }

  soldiersOf(territoryId: string): number {
    let n = 0;
    for (const army of Object.values(this.state.armies)) {
      if (army.territoryId !== territoryId) continue;
      for (const [kind, count] of Object.entries(army.units)) {
        n += (UNIT_DEFS[kind as keyof typeof UNIT_DEFS]?.manpower ?? 1) * (count ?? 0);
      }
    }
    return n;
  }

  report(t: Territory): TerritoryReport {
    const gross = emptyBag();
    const inputs = emptyBag();
    let jobs = 0;
    let employed = 0;

    for (const id of t.buildingIds) {
      const b = this.state.buildings[id];
      if (!b) continue;
      const def = BUILDING_DEFS[b.defId];
      if (!def) continue;
      jobs += def.jobsPerLevel * b.level;
      employed += b.workers;
      if (b.construction > 0) continue;
      const scale = this.buildingScale(b, t);
      if (def.output) addBag(gross, def.output, scale);
      if (def.input) addBag(inputs, def.input, scale);
    }

    const taxes = t.population * ECONOMY.taxPerPopPerMinute * (0.5 + t.happiness / 150);
    const wages = employed * WORKFORCE.wagePerMinute;
    const foodUpkeep = t.population * ECONOMY.foodPerPopPerMinute;

    const armyUpkeep = emptyBag();
    for (const army of Object.values(this.state.armies)) {
      if (army.territoryId !== t.id) continue;
      for (const [kind, count] of Object.entries(army.units)) {
        const def = UNIT_DEFS[kind as keyof typeof UNIT_DEFS];
        if (def) addBag(armyUpkeep, def.upkeep, count ?? 0);
      }
    }

    const net = emptyBag();
    for (const k of RESOURCE_KINDS) net[k] = gross[k] - inputs[k] - armyUpkeep[k];
    net.coin += taxes - wages;
    net.food -= foodUpkeep;

    const laborPool = this.laborPool(t);
    return {
      gross,
      inputs,
      net,
      jobs,
      employed,
      laborPool,
      idleWorkers: Math.max(0, t.hiredWorkers - employed),
      housing: this.housingOf(t),
      storage: this.storageOf(t),
      wages,
      taxes,
      foodUpkeep,
      soldiers: this.soldiersOf(t.id),
      armyUpkeep,
    };
  }

  /** Saldo por minuto de todo o reino — usado no HUD. */
  kingdomNet(kingdomId: KingdomId): ResourceBag {
    const total = emptyBag();
    for (const t of Object.values(this.state.territories)) {
      if (t.ownerId !== kingdomId) continue;
      addBag(total, this.report(t).net, 1);
    }
    return total;
  }

  kingdomStorage(kingdomId: KingdomId): number {
    let cap = 0;
    for (const t of Object.values(this.state.territories)) {
      if (t.ownerId !== kingdomId) continue;
      cap += this.storageOf(t);
    }
    return cap;
  }

  // -- simulação ------------------------------------------------------------

  /**
   * Um passo de economia. Extração roda primeiro; as refinarias consomem o que
   * existe em estoque + o que acabou de ser extraído, com a eficiência caindo
   * proporcionalmente quando falta insumo (o gargalo aparece na UI).
   */
  tick(dtSeconds: number): void {
    this.accumulator += dtSeconds;
    if (this.accumulator < TIME.economyStep) return;
    const step = this.accumulator;
    this.accumulator = 0;
    this.step(step);
  }

  private step(dtSeconds: number): void {
    const minutes = dtSeconds / 60;

    for (const kingdom of Object.values(this.state.kingdoms)) {
      const owned = Object.values(this.state.territories).filter((t) => t.ownerId === kingdom.id);
      if (owned.length === 0) continue;

      const gain = emptyBag();
      const consumers: { b: Building; t: Territory; scale: number }[] = [];

      // 1. Extratores e efeitos diretos.
      for (const t of owned) {
        for (const id of t.buildingIds) {
          const b = this.state.buildings[id];
          if (!b) continue;
          const def = BUILDING_DEFS[b.defId];
          if (!def) continue;
          if (b.construction > 0) {
            b.construction = Math.max(0, b.construction - dtSeconds);
            if (b.construction === 0) b.level = b.targetLevel;
            b.efficiency = 0;
            continue;
          }
          const scale = this.buildingScale(b, t);
          if (def.input) {
            consumers.push({ b, t, scale });
          } else if (def.output) {
            addBag(gain, def.output, scale * minutes);
            b.efficiency = scale > 0 ? Math.min(1, b.workers / (def.jobsPerLevel * b.level)) : 0;
          } else {
            b.efficiency = 1;
          }
        }
      }

      // 2. Demanda das refinarias.
      const demand = emptyBag();
      for (const c of consumers) {
        const def = BUILDING_DEFS[c.b.defId];
        if (def.input) addBag(demand, def.input, c.scale * minutes);
      }
      const ratio: Partial<Record<ResourceKind, number>> = {};
      for (const k of RESOURCE_KINDS) {
        if (demand[k] <= 0) continue;
        const available = kingdom.resources[k] + gain[k];
        ratio[k] = Math.max(0, Math.min(1, available / demand[k]));
      }

      // 3. Refino com eficiência limitada pelo insumo mais escasso.
      for (const c of consumers) {
        const def = BUILDING_DEFS[c.b.defId];
        let eff = 1;
        for (const k of RESOURCE_KINDS) {
          if ((def.input?.[k] ?? 0) > 0) eff = Math.min(eff, ratio[k] ?? 0);
        }
        if (c.scale <= 0) eff = 0;
        c.b.efficiency = eff;
        if (eff <= 0) continue;
        if (def.input) addBag(gain, def.input, -c.scale * minutes * eff);
        if (def.output) addBag(gain, def.output, c.scale * minutes * eff);
      }

      // 4. Impostos, salários, comida e manutenção militar.
      for (const t of owned) {
        const r = this.report(t);
        gain.coin += (r.taxes - r.wages) * minutes;
        gain.food -= r.foodUpkeep * minutes;
        for (const k of RESOURCE_KINDS) gain[k] -= r.armyUpkeep[k] * minutes;
      }

      // 5. Aplica com teto de armazenamento.
      const cap = this.kingdomStorage(kingdom.id);
      for (const k of RESOURCE_KINDS) {
        kingdom.resources[k] = Math.max(0, Math.min(cap, kingdom.resources[k] + gain[k]));
      }

      // 6. População: cresce com comida e moradia, encolhe na fome.
      const starving = kingdom.resources.food <= 0;
      for (const t of owned) {
        const housing = this.housingOf(t);
        if (starving) {
          t.population = Math.max(40, t.population - t.population * ECONOMY.starvationPerMinute * minutes);
          t.happiness = Math.max(5, t.happiness - 4 * minutes);
        } else if (t.population < housing) {
          t.population += t.population * ECONOMY.growthPerMinute * minutes;
          t.happiness = Math.min(100, t.happiness + 0.6 * minutes);
        }
        t.hiredWorkers = Math.min(t.hiredWorkers, this.laborPool(t));
      }
    }
  }
}
