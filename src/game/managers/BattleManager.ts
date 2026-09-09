import { BATTLE } from '../config/balance';
import { UNIT_DEFS } from '../data/defs';
import type { Army, Battle, BattleSide, GameState, UnitKind } from '../types';
import { stackSize, type UnitStack } from './ArmyManager';

export interface BattlePreview {
  winner: 'attacker' | 'defender';
  rounds: number;
  attackerLosses: number;
  defenderLosses: number;
  attackerStart: number;
  defenderStart: number;
  /** Poder efetivo, já com fortificação e moral. */
  attackerPower: number;
  defenderPower: number;
  wallHp: number;
}

let counter = 0;
const nextId = (p: string) => `${p}_${Date.now().toString(36)}_${(counter++).toString(36)}`;

function cloneStack(units: UnitStack): UnitStack {
  const out: UnitStack = {};
  for (const k of Object.keys(units) as UnitKind[]) {
    if ((units[k] ?? 0) > 0) out[k] = units[k];
  }
  return out;
}

function stackHp(units: UnitStack): number {
  let hp = 0;
  for (const k of Object.keys(units) as UnitKind[]) hp += UNIT_DEFS[k].hp * (units[k] ?? 0);
  return hp;
}

function stackAttack(units: UnitStack): number {
  let a = 0;
  for (const k of Object.keys(units) as UnitKind[]) a += UNIT_DEFS[k].attack * (units[k] ?? 0);
  return a;
}

function stackSiege(units: UnitStack): number {
  let s = 0;
  for (const k of Object.keys(units) as UnitKind[]) s += UNIT_DEFS[k].siege * (units[k] ?? 0);
  return s;
}

/** Retira `casualties` unidades, distribuídas na proporção da composição. */
function applyCasualties(units: UnitStack, casualties: number): number {
  const total = stackSize(units);
  if (total <= 0 || casualties <= 0) return 0;
  // Baixas são sempre inteiras: meio soldado não existe.
  const toKill = Math.min(total, Math.round(casualties));
  if (toKill <= 0) return 0;
  let killed = 0;
  const kinds = (Object.keys(units) as UnitKind[]).sort(
    (a, b) => UNIT_DEFS[a].hp - UNIT_DEFS[b].hp,
  );
  // Os mais frágeis caem primeiro — leitura intuitiva e favorece tropa cara.
  for (const kind of kinds) {
    if (killed >= toKill) break;
    const have = units[kind] ?? 0;
    const share = Math.min(have, Math.ceil((have / total) * toKill), toKill - killed);
    const take = Math.max(0, share);
    units[kind] = have - take;
    killed += take;
    if ((units[kind] ?? 0) <= 0) delete units[kind];
  }
  // Sobra por arredondamento: tira de quem ainda existe.
  while (killed < toKill) {
    const kind = (Object.keys(units) as UnitKind[])[0];
    if (!kind) break;
    units[kind] = (units[kind] ?? 0) - 1;
    if ((units[kind] ?? 0) <= 0) delete units[kind];
    killed++;
  }
  return killed;
}

/**
 * BattleManager — resolução de combate (§18).
 *
 * O combate não é um RTS: rodadas curtas resolvidas por atributos, com moral,
 * muralha, terreno e cerco. O jogador vê a prévia antes de atacar, porque a
 * pergunta do jogo é "vale a pena vencer?" (§17).
 */
export class BattleManager {
  constructor(private state: GameState) {}

  // -- montagem -------------------------------------------------------------

  /** Bônus defensivo do território: muralha do castelo + terreno. */
  fortificationOf(territoryId: string): { fort: number; wallHp: number } {
    const t = this.state.territories[territoryId];
    if (!t) return { fort: 0, wallHp: 0 };
    const castle = t.castleId ? this.state.castles[t.castleId] : null;
    const level = castle?.level ?? 0;
    const isWalled = castle ? castle.kind === 'castle' || castle.kind === 'fort' : false;
    const fort =
      level * BATTLE.fortPerCastleLevel + (BATTLE.terrainBonus[t.biome] ?? 0) + t.defense / 400;
    const wallHp = isWalled ? level * BATTLE.wallHpPerCastleLevel : 0;
    return { fort, wallHp };
  }

  /** Tropas que defendem um território (guarnição + guarda do castelo). */
  defenderStack(territoryId: string): { units: UnitStack; armyIds: string[]; morale: number } {
    const units: UnitStack = {};
    const armyIds: string[] = [];
    let morale = 60;
    let counted = 0;

    for (const army of Object.values(this.state.armies)) {
      if (army.territoryId !== territoryId) continue;
      if (army.state !== 'garrison') continue;
      armyIds.push(army.id);
      for (const kind of Object.keys(army.units) as UnitKind[]) {
        units[kind] = (units[kind] ?? 0) + (army.units[kind] ?? 0);
      }
      const size = stackSize(army.units);
      morale = counted + size > 0 ? (morale * counted + army.morale * size) / (counted + size) : morale;
      counted += size;
    }

    // Guarnição fixa do castelo: milícia levantada às pressas.
    const t = this.state.territories[territoryId];
    const castle = t?.castleId ? this.state.castles[t.castleId] : null;
    if (castle) {
      const levy = Math.round(castle.garrison / 8);
      if (levy > 0) units.militia = (units.militia ?? 0) + levy;
    }
    return { units, armyIds, morale };
  }

  // -- prévia ---------------------------------------------------------------

  /** Simula a batalha inteira em memória. Não muda nada no estado. */
  preview(attackerUnits: UnitStack, attackerMorale: number, territoryId: string): BattlePreview {
    const a = cloneStack(attackerUnits);
    const d = this.defenderStack(territoryId);
    const def = cloneStack(d.units);
    const { fort, wallHp } = this.fortificationOf(territoryId);

    const attackerStart = stackSize(a);
    const defenderStart = stackSize(def);

    let aMorale = attackerMorale;
    let dMorale = d.morale;
    let wall = wallHp;
    let round = 0;
    let winner: 'attacker' | 'defender' = 'defender';

    while (round < BATTLE.maxRounds) {
      round++;
      const r = this.resolveRound(a, def, aMorale, dMorale, fort, wall);
      aMorale = r.attackerMorale;
      dMorale = r.defenderMorale;
      wall = r.wallHp;
      if (stackSize(def) <= 0 || dMorale < BATTLE.routMorale) {
        winner = 'attacker';
        break;
      }
      if (stackSize(a) <= 0 || aMorale < BATTLE.routMorale) {
        winner = 'defender';
        break;
      }
    }

    return {
      winner,
      rounds: round,
      attackerLosses: attackerStart - stackSize(a),
      defenderLosses: defenderStart - stackSize(def),
      attackerStart,
      defenderStart,
      attackerPower: Math.round(stackAttack(attackerUnits) * (0.5 + attackerMorale / 200)),
      defenderPower: Math.round(stackAttack(d.units) * (0.5 + d.morale / 200) * (1 + fort)),
      wallHp,
    };
  }

  /**
   * Uma rodada. Muta as pilhas recebidas — é usado tanto pela prévia (em
   * cópias) quanto pela batalha real.
   */
  private resolveRound(
    attacker: UnitStack,
    defender: UnitStack,
    attackerMorale: number,
    defenderMorale: number,
    fort: number,
    wallHp: number,
  ) {
    const aSize = stackSize(attacker);
    const dSize = stackSize(defender);
    if (aSize <= 0 || dSize <= 0) {
      return { attackerMorale, defenderMorale, wallHp, attackerKilled: 0, defenderKilled: 0 };
    }

    const aPower = stackAttack(attacker) * (0.5 + attackerMorale / 200);
    const dPower = stackAttack(defender) * (0.5 + defenderMorale / 200) * (1 + fort);

    // Cerco: enquanto a muralha estiver de pé, parte do dano é absorvida.
    let wall = wallHp;
    let throughput = 1;
    if (wall > 0) {
      const siege = stackSiege(attacker) * BATTLE.damagePerRound;
      wall = Math.max(0, wall - Math.max(siege, aPower * 0.05));
      throughput = 0.45;
    }

    const damageToDefender = aPower * BATTLE.damagePerRound * throughput;
    const damageToAttacker = dPower * BATTLE.damagePerRound;

    const defenderAvgHp = stackHp(defender) / Math.max(1, dSize);
    const attackerAvgHp = stackHp(attacker) / Math.max(1, aSize);

    const defenderKilled = applyCasualties(defender, damageToDefender / Math.max(1, defenderAvgHp));
    const attackerKilled = applyCasualties(attacker, damageToAttacker / Math.max(1, attackerAvgHp));

    const aMorale = Math.max(
      0,
      attackerMorale - (attackerKilled / Math.max(1, aSize)) * BATTLE.moraleLossPerLossRatio,
    );
    const dMorale = Math.max(
      0,
      defenderMorale - (defenderKilled / Math.max(1, dSize)) * BATTLE.moraleLossPerLossRatio,
    );

    return {
      attackerMorale: aMorale,
      defenderMorale: dMorale,
      wallHp: wall,
      attackerKilled,
      defenderKilled,
    };
  }

  // -- batalha real ---------------------------------------------------------

  start(attackerArmy: Army, territoryId: string): Battle {
    const t = this.state.territories[territoryId];
    const castle = t?.castleId ? this.state.castles[t.castleId] : null;
    const d = this.defenderStack(territoryId);
    const { fort, wallHp } = this.fortificationOf(territoryId);

    const attacker: BattleSide = {
      kingdomId: attackerArmy.ownerId,
      armyIds: [attackerArmy.id],
      units: cloneStack(attackerArmy.units),
      startUnits: cloneStack(attackerArmy.units),
      morale: attackerArmy.morale,
      fortification: 0,
      wallHp: 0,
      maxWallHp: 0,
    };
    const defender: BattleSide = {
      kingdomId: t?.ownerId ?? null,
      armyIds: d.armyIds,
      units: cloneStack(d.units),
      startUnits: cloneStack(d.units),
      morale: d.morale,
      fortification: fort,
      wallHp,
      maxWallHp: wallHp,
    };

    const battle: Battle = {
      id: nextId('btl'),
      territoryId,
      position: castle?.position ?? t?.center ?? { x: 0, y: 0 },
      attacker,
      defender,
      roundTimer: BATTLE.roundSeconds,
      round: 0,
      elapsed: 0,
      finished: false,
      winner: null,
      log: [`As tropas se encontram em ${t?.name ?? 'campo aberto'}.`],
    };

    this.state.battles[battle.id] = battle;
    attackerArmy.state = 'fighting';
    attackerArmy.battleId = battle.id;
    attackerArmy.position = battle.position;
    for (const id of d.armyIds) {
      const army = this.state.armies[id];
      if (army) {
        army.state = 'fighting';
        army.battleId = battle.id;
      }
    }
    return battle;
  }

  /** Avança as batalhas. Devolve as que terminaram neste passo. */
  tick(dtSeconds: number): Battle[] {
    const finished: Battle[] = [];
    for (const battle of Object.values(this.state.battles)) {
      if (battle.finished) continue;
      battle.elapsed += dtSeconds;
      battle.roundTimer -= dtSeconds;
      if (battle.roundTimer > 0) continue;
      battle.roundTimer = BATTLE.roundSeconds;
      battle.round++;

      const r = this.resolveRound(
        battle.attacker.units,
        battle.defender.units,
        battle.attacker.morale,
        battle.defender.morale,
        battle.defender.fortification,
        battle.defender.wallHp,
      );
      battle.attacker.morale = r.attackerMorale;
      battle.defender.morale = r.defenderMorale;

      if (battle.defender.wallHp > 0 && r.wallHp <= 0) {
        battle.log.push('A muralha ruiu!');
      }
      battle.defender.wallHp = r.wallHp;

      if (r.attackerKilled || r.defenderKilled) {
        battle.log.push(
          `Rodada ${battle.round}: atacante −${r.attackerKilled}, defensor −${r.defenderKilled}.`,
        );
      }
      if (battle.log.length > 6) battle.log.splice(0, battle.log.length - 6);

      const aOut = stackSize(battle.attacker.units) <= 0 || battle.attacker.morale < BATTLE.routMorale;
      const dOut = stackSize(battle.defender.units) <= 0 || battle.defender.morale < BATTLE.routMorale;

      if (dOut && !aOut) {
        battle.winner = 'attacker';
      } else if (aOut) {
        battle.winner = 'defender';
      } else if (battle.round >= BATTLE.maxRounds) {
        battle.winner = 'defender';
        battle.log.push('O cerco fracassou.');
      }

      if (battle.winner) {
        battle.finished = true;
        finished.push(battle);
      }
    }
    return finished;
  }
}
