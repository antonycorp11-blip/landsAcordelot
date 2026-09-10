import { LORE, type DecisionDef, type DecisionOption } from '../data/defs';
import type { GameState, UnitKind } from '../types';

/**
 * CouncilManager — as demandas do conselho.
 *
 * De tempos em tempos o governador ou o general aparece com um problema que
 * não se resolve sozinho. Nenhuma das saídas é gratuita: sempre se paga em
 * ouro, em humor do povo ou em moral da tropa. É onde o reino deixa de ser
 * planilha e vira governo.
 */
export class CouncilManager {
  /** Segundos até a próxima demanda ser considerada. */
  private timer = 0;
  /** Demanda aberta, esperando decisão. */
  pending: DecisionDef | null = null;
  /** Última resposta do conselheiro, para mostrar o desfecho. */
  lastReply: string | null = null;

  /** Intervalo entre demandas, em segundos de simulação. */
  private readonly interval = 150;

  constructor(private state: GameState) {}

  /** Já vistas não voltam — cada demanda é um momento, não um loop. */
  private seen(): Set<string> {
    return new Set(this.state.chronicle.filter((id) => id.startsWith('dec_')));
  }

  private eligible(): DecisionDef[] {
    const seen = this.seen();
    const mine = Object.values(this.state.territories).filter(
      (t) => t.ownerId === this.state.playerKingdomId,
    );
    const soldiers = Object.values(this.state.armies)
      .filter((a) => a.ownerId === this.state.playerKingdomId)
      .reduce((sum, a) => sum + Object.values(a.units).reduce((x, n) => x + (n ?? 0), 0), 0);
    const coin = this.state.kingdoms[this.state.playerKingdomId].resources.coin;

    return LORE.decisions.filter((d) => {
      if (seen.has(d.id)) return false;
      const r = d.require;
      if (!r) return true;
      if (r.minTerritories && mine.length < r.minTerritories) return false;
      if (r.minSoldiers && soldiers < r.minSoldiers) return false;
      if (r.minCoin && coin < r.minCoin) return false;
      return true;
    });
  }

  /** Chamado pelo loop central. Abre uma demanda quando chega a hora. */
  tick(dtSeconds: number): DecisionDef | null {
    if (this.pending) return null;
    this.timer += dtSeconds;
    if (this.timer < this.interval) return null;
    this.timer = 0;

    const options = this.eligible();
    if (options.length === 0) return null;
    // Determinístico o bastante para não repetir sempre a mesma.
    const pick = options[Math.floor(Math.random() * options.length)];
    this.pending = pick;
    return pick;
  }

  /** Aplica a escolha do jogador e fecha a demanda. */
  decide(optionIndex: number): DecisionOption | null {
    const decision = this.pending;
    if (!decision) return null;
    const option = decision.options[optionIndex];
    if (!option) return null;

    const kingdom = this.state.kingdoms[this.state.playerKingdomId];
    const mine = Object.values(this.state.territories).filter(
      (t) => t.ownerId === this.state.playerKingdomId,
    );
    const e = option.effects;

    if (e.coin) kingdom.resources.coin = Math.max(0, kingdom.resources.coin + e.coin);
    if (e.food) kingdom.resources.food = Math.max(0, kingdom.resources.food + e.food);

    for (const t of mine) {
      if (e.happiness) t.happiness = clamp(t.happiness + e.happiness);
      if (e.stability) t.stability = clamp(t.stability + e.stability);
      if (e.loyalty) t.loyalty = clamp(t.loyalty + e.loyalty);
    }

    if (e.morale) {
      for (const army of Object.values(this.state.armies)) {
        if (army.ownerId !== this.state.playerKingdomId) continue;
        army.morale = clamp(army.morale + e.morale);
      }
    }

    // Tropa que chega pela decisão vai para a capital.
    if (e.units) {
      const capitalId = this.state.kingdoms[this.state.playerKingdomId].capitalTerritoryId;
      const garrison = Object.values(this.state.armies).find(
        (a) => a.territoryId === capitalId && a.state === 'garrison',
      );
      if (garrison) {
        for (const [kind, n] of Object.entries(e.units)) {
          garrison.units[kind as UnitKind] = (garrison.units[kind as UnitKind] ?? 0) + n;
        }
      }
    }

    if (e.renown) this.state.stats.renownGranted = (this.state.stats.renownGranted ?? 0) + e.renown;

    // A decisão vira linha da crônica e não volta a ser oferecida.
    if (!this.state.chronicle.includes(decision.id)) this.state.chronicle.push(decision.id);

    this.pending = null;
    this.lastReply = option.reply;
    return option;
  }
}

function clamp(v: number): number {
  return Math.max(0, Math.min(100, v));
}
