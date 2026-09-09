import { TRADE } from '../config/balance';
import { BUILDING_DEFS } from '../data/defs';
import type { GameState, ResourceKind, Territory } from '../types';

export interface TradeQuote {
  ok: boolean;
  reason: string;
  /** Quanto o jogador recebe pela quantidade oferecida. */
  receiveAmount: number;
  /** Margem cobrada pela caravana (0..1). */
  spread: number;
  /** Valor máximo que a caravana consegue mover de uma vez. */
  capacity: number;
  /** Valor da oferta, na mesma escala da capacidade. */
  offerValue: number;
  marketLevel: number;
  cooldown: number;
}

/**
 * TradeManager — o mercado da região (§12).
 *
 * Excedente vira o que falta: madeira sobrando compra comida, minério compra
 * tábuas. A caravana cobra margem, tem capacidade limitada por viagem e leva um
 * tempo para voltar — comércio é logística, não um botão de converter recurso.
 */
export class TradeManager {
  constructor(private state: GameState) {}

  /** Nível do melhor mercado pronto no território (0 = sem mercado). */
  marketLevel(t: Territory): number {
    let level = 0;
    for (const id of t.buildingIds) {
      const b = this.state.buildings[id];
      if (!b || b.construction > 0) continue;
      if (BUILDING_DEFS[b.defId]?.enablesTrade) level = Math.max(level, b.level);
    }
    return level;
  }

  spreadFor(level: number): number {
    return TRADE.spreadByLevel[Math.min(level, TRADE.spreadByLevel.length - 1)];
  }

  capacityFor(level: number): number {
    return TRADE.capacityByLevel[Math.min(level, TRADE.capacityByLevel.length - 1)];
  }

  valueOf(kind: ResourceKind): number {
    return TRADE.value[kind] ?? 1;
  }

  /** Cotação sem efeito colateral — a UI chama a cada digitação. */
  quote(t: Territory, give: ResourceKind, amount: number, receive: ResourceKind): TradeQuote {
    const level = this.marketLevel(t);
    const spread = this.spreadFor(level);
    const capacity = this.capacityFor(level);
    const offerValue = amount * this.valueOf(give);
    const base = {
      receiveAmount: 0,
      spread,
      capacity,
      offerValue,
      marketLevel: level,
      cooldown: Math.max(0, t.tradeCooldown),
    };
    const fail = (reason: string): TradeQuote => ({ ok: false, reason, ...base });

    if (t.ownerId !== this.state.playerKingdomId) return fail('Território não é seu.');
    if (level <= 0) return fail('Construa um Mercado neste território.');
    if (give === receive) return fail('Escolha recursos diferentes.');
    if (amount <= 0) return fail('Defina a quantidade a oferecer.');
    if (t.tradeCooldown > 0) {
      return fail(`Caravana a caminho — volta em ${Math.ceil(t.tradeCooldown)}s.`);
    }

    const kingdom = this.state.kingdoms[t.ownerId];
    if (kingdom.resources[give] < amount) return fail('Você não tem essa quantidade.');
    if (offerValue > capacity) {
      return fail(`A caravana leva no máximo ${Math.floor(capacity / this.valueOf(give))}.`);
    }

    const receiveAmount = Math.floor((offerValue * (1 - spread)) / this.valueOf(receive));
    if (receiveAmount <= 0) return fail('Oferta pequena demais para valer uma viagem.');

    return { ok: true, reason: 'Caravana pronta.', ...base, receiveAmount };
  }

  execute(territoryId: string, give: ResourceKind, amount: number, receive: ResourceKind): boolean {
    const t = this.state.territories[territoryId];
    if (!t) return false;
    const q = this.quote(t, give, amount, receive);
    if (!q.ok) return false;

    const kingdom = this.state.kingdoms[t.ownerId!];
    kingdom.resources[give] -= amount;
    kingdom.resources[receive] += q.receiveAmount;
    t.tradeCooldown = TRADE.cooldownSeconds;
    return true;
  }

  /** Chamado pelo loop central: devolve a caravana à praça. */
  tick(dtSeconds: number) {
    for (const t of Object.values(this.state.territories)) {
      if (t.tradeCooldown > 0) t.tradeCooldown = Math.max(0, t.tradeCooldown - dtSeconds);
    }
  }
}
