import { AI, DIPLOMACY } from '../config/balance';
import { BUILDING_LIST, UNIT_LIST } from '../data/defs';
import type { Building, Deposit, GameState, Kingdom, Territory, UnitKind } from '../types';
import type { ArmyManager, UnitStack } from './ArmyManager';
import { stackSize } from './ArmyManager';
import type { DiplomacyManager } from './DiplomacyManager';
import type { BattleManager } from './BattleManager';
import type { BuildingManager } from './BuildingManager';
import type { EconomyManager } from './EconomyManager';

/**
 * AIManager — os outros reinos vivem (§30).
 *
 * A IA usa exatamente as mesmas portas do jogador (BuildingManager,
 * ArmyManager). Ela não pode fazer nada que a UI não permita: mesmas regras de
 * fronteira, mesmos custos, mesma fila de obras.
 *
 * Pensa em intervalos e um reino por vez, para não pesar no quadro (§77).
 */
export class AIManager {
  private timer = 0;
  private cursor = 0;
  /** Mensagens do que a IA fez, para o diário de eventos da UI. */
  readonly journal: string[] = [];

  constructor(
    private state: GameState,
    private economy: EconomyManager,
    private buildings: BuildingManager,
    private armies: ArmyManager,
    private battles: BattleManager,
    private diplomacy: DiplomacyManager,
  ) {}

  tick(dtSeconds: number) {
    this.timer += dtSeconds;
    if (this.timer < AI.thinkIntervalSeconds) return;
    this.timer = 0;

    const kingdoms = Object.values(this.state.kingdoms).filter(
      (k) => k.ownerKind === 'AI' && k.aiProfile !== 'NONE',
    );
    if (kingdoms.length === 0) return;
    const kingdom = kingdoms[this.cursor % kingdoms.length];
    this.cursor++;
    this.think(kingdom);
  }

  private territoriesOf(kingdomId: string): Territory[] {
    return Object.values(this.state.territories).filter((t) => t.ownerId === kingdomId);
  }

  private think(kingdom: Kingdom) {
    const profile = AI.profiles[kingdom.aiProfile] ?? AI.profiles.ECONOMIC;
    const owned = this.territoriesOf(kingdom.id);
    if (owned.length === 0) return;

    // 1. Mão de obra: prédio parado é dinheiro parado.
    for (const t of owned) this.staffTerritory(t, kingdom);

    // 2. Economia.
    if (Math.random() < profile.build) this.tryBuild(kingdom, owned);

    // 3. Tropas.
    if (Math.random() < profile.recruit) this.tryRecruit(kingdom, owned);

    // 4. Campanha.
    // Em guerra declarada a IA vai para cima com mais frequência: um pacto
    // rompido tem de doer, senão declarar guerra é só um rótulo.
    const rel = this.diplomacy.relation(kingdom.id);
    const chance = profile.attack + (rel?.pact === 'war' ? DIPLOMACY.aiWarAttackBonus : 0);
    if (Math.random() < chance) this.tryAttack(kingdom, owned);
  }

  /** Contrata e aloca trabalhadores até encher as vagas que consegue pagar. */
  private staffTerritory(t: Territory, kingdom: Kingdom) {
    const openJobs = this.economy.report(t).jobs - this.economy.report(t).employed;
    if (openJobs <= 0) return;

    // Relê os ociosos a cada volta: o valor muda a cada contratação.
    for (let i = 0; i < Math.min(openJobs, 3); i++) {
      if (kingdom.resources.coin <= AI.coinReserve) break;
      if (this.economy.report(t).idleWorkers > 0) continue;
      if (!this.buildings.hireWorker(t.id, kingdom.id)) break;
    }

    for (const id of t.buildingIds) {
      const b = this.state.buildings[id];
      if (!b || b.construction > 0) continue;
      // Tenta preencher; o próprio manager barra se não houver ocioso.
      for (let i = 0; i < 3; i++) {
        if (!this.buildings.assignWorker(b.id, +1, kingdom.id)) break;
      }
    }
  }

  /**
   * Prioridade: destravar a cadeia produtiva. Extrai o que falta, refina o que
   * está sobrando bruto, e só então pensa em quartel e moradia.
   */
  private tryBuild(kingdom: Kingdom, owned: Territory[]) {
    const res = kingdom.resources;
    const has = (kind: string) =>
      Object.values(this.state.buildings).some(
        (b) => b.defId === kind && this.state.territories[b.territoryId]?.ownerId === kingdom.id,
      );

    for (const t of owned) {
      // a) Depósito livre com extrator disponível.
      const free = t.depositIds
        .map((id) => this.state.deposits[id])
        .filter((d): d is Deposit => Boolean(d) && !d.buildingId);
      for (const dep of free) {
        const def = BUILDING_LIST.find((b) => b.deposit === dep.kind);
        if (!def) continue;
        if (this.buildings.build(t.id, def.id, dep.id, kingdom.id)) {
          this.note(`${kingdom.name} abriu ${def.name} em ${t.name}.`);
          return;
        }
      }

      // b) Refinaria quando o bruto acumula.
      const chain: [string, keyof typeof res][] = [
        ['sawmill', 'wood'],
        ['brickworks', 'stone'],
        ['foundry', 'ore'],
        ['mint', 'goldOre'],
      ];
      for (const [kind, raw] of chain) {
        if (res[raw] < 120 || has(kind)) continue;
        const def = BUILDING_LIST.find((b) => b.id === kind);
        if (!def) continue;
        if (this.buildings.build(t.id, def.id, undefined, kingdom.id)) {
          this.note(`${kingdom.name} ergueu ${def.name} em ${t.name}.`);
          return;
        }
      }

      // c) Quartel e moradia.
      const wants = has('barracks') ? 'house' : 'barracks';
      const def = BUILDING_LIST.find((b) => b.id === wants);
      if (def && this.buildings.build(t.id, def.id, undefined, kingdom.id)) {
        this.note(`${kingdom.name} construiu ${def.name} em ${t.name}.`);
        return;
      }
    }
  }

  private tryRecruit(kingdom: Kingdom, owned: Territory[]) {
    if (kingdom.resources.coin < AI.coinReserve) return;
    // Da unidade mais forte que couber para a mais simples.
    const options = [...UNIT_LIST].reverse();
    for (const t of owned) {
      if (this.armies.barracksLevel(t) <= 0) continue;
      for (const unit of options) {
        // A IA também recruta em lote, proporcional ao que consegue pagar.
        const cabem = this.armies.maxRecruitable(t, unit.id, kingdom.id);
        if (cabem <= 0) continue;
        const lote = Math.max(1, Math.min(cabem, unit.requiresBarracks >= 3 ? 2 : 4));
        if (this.armies.checkRecruit(t, unit.id, lote, kingdom.id).ok) {
          this.armies.recruit(t.id, unit.id, lote, kingdom.id);
          this.note(`${kingdom.name} treina ${lote}× ${unit.name} em ${t.name}.`);
          return;
        }
      }
    }
  }

  /**
   * Escolhe o alvo mais fraco na fronteira e só marcha com vantagem clara.
   * Usa a mesma prévia de batalha que o jogador vê (§17).
   */
  private tryAttack(kingdom: Kingdom, owned: Territory[]) {
    // Não abre uma segunda frente enquanto já tem coluna em campo.
    if (this.armies.marchingArmies(kingdom.id).length > 0) return;

    let best: { from: Territory; to: Territory; units: UnitStack; ratio: number } | null = null;

    for (const from of owned) {
      const garrison = this.armies.garrisonOf(from.id);
      if (!garrison) continue;
      const size = stackSize(garrison.units);
      if (size < AI.minCampaignUnits) continue;

      // Deixa uma reserva em casa: nunca esvazia o território.
      const send: UnitStack = {};
      for (const kind of Object.keys(garrison.units) as UnitKind[]) {
        const n = garrison.units[kind] ?? 0;
        const keep = Math.max(1, Math.round(n * 0.35));
        const going = n - keep;
        if (going > 0) send[kind] = going;
      }
      if (stackSize(send) < AI.minCampaignUnits) continue;

      for (const nid of from.neighbors) {
        const to = this.state.territories[nid];
        if (!to || to.ownerId === kingdom.id || to.locked) continue;
        if (this.diplomacy.attackBlocked(kingdom.id, to.ownerId)) continue;
        if (!this.armies.checkMarch(from.id, nid, send, kingdom.id).ok) continue;

        const preview = this.battles.preview(send, garrison.morale, nid);
        if (preview.winner !== 'attacker') continue;
        const ratio = preview.defenderPower > 0
          ? preview.attackerPower / preview.defenderPower
          : 99;
        if (ratio < AI.attackPowerRatio) continue;
        if (!best || ratio > best.ratio) best = { from, to, units: send, ratio };
      }
    }

    if (!best) return;
    if (this.armies.dispatch(best.from.id, best.to.id, best.units, kingdom.id)) {
      this.note(`${kingdom.name} marcha sobre ${best.to.name}.`);
    }
  }

  private note(message: string) {
    this.journal.push(message);
    if (this.journal.length > 12) this.journal.shift();
  }
}

/** Ajuda a UI a mostrar quem defende um território (usado no painel). */
export function garrisonSummary(state: GameState, territoryId: string): Building[] {
  return state.territories[territoryId]?.buildingIds
    .map((id) => state.buildings[id])
    .filter((b): b is Building => Boolean(b)) ?? [];
}
