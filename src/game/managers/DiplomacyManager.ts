import { DIPLOMACY } from '../config/balance';
import type { GameState, Kingdom, PactKind, Relation } from '../types';

/** O que uma ação diplomática devolve: ou aconteceu, ou tem um motivo. */
export interface DiplomacyResult {
  ok: boolean;
  message: string;
}

/** Uma opção na mesa, já com o preço e o porquê de estar trancada. */
export interface DiplomacyOffer {
  id: 'gift' | 'truce' | 'marriage' | 'alliance' | 'vassal' | 'war' | 'peace';
  label: string;
  hint: string;
  coin: number;
  lock: string | null;
}

/**
 * DiplomacyManager — o que existe entre você e os vizinhos (§17).
 *
 * Nenhum pacto aqui é decorativo. Trégua e aliança travam o ataque nos dois
 * sentidos, e é por isso que assinar custa: você compra uma fronteira
 * tranquila entregando uma porta de conquista. Casamento não é um número
 * maior, é o laço que não vence e o único caminho até a aliança sem ter de
 * comprá-la a peso de ouro.
 */
export class DiplomacyManager {
  constructor(private state: GameState) {}

  /** Garante uma relação para cada reino estrangeiro vivo. */
  sync() {
    for (const k of Object.values(this.state.kingdoms)) {
      if (k.id === this.state.playerKingdomId) continue;
      if (this.state.relations[k.id]) continue;
      this.state.relations[k.id] = {
        kingdomId: k.id,
        attitude: 0,
        pact: 'neutral',
        pactDays: 0,
        married: false,
        tribute: 0,
        giftCooldown: 0,
      };
    }
  }

  relation(kingdomId: string): Relation | null {
    return this.state.relations[kingdomId] ?? null;
  }

  /** Reinos estrangeiros que ainda têm terra — os que sumiram saem da mesa. */
  foreignKingdoms(): Kingdom[] {
    const alive = new Set(
      Object.values(this.state.territories)
        .map((t) => t.ownerId)
        .filter((id): id is string => Boolean(id)),
    );
    return Object.values(this.state.kingdoms).filter(
      (k) => k.id !== this.state.playerKingdomId && alive.has(k.id),
    );
  }

  /** O ataque está travado por um pacto? Vale nos dois sentidos. */
  attackBlocked(attackerId: string | null, defenderId: string | null): boolean {
    if (!attackerId || !defenderId || attackerId === defenderId) return false;
    const me = this.state.playerKingdomId;
    const other = attackerId === me ? defenderId : defenderId === me ? attackerId : null;
    // Briga entre dois estrangeiros não passa pela sua mesa.
    if (!other) return false;
    const rel = this.state.relations[other];
    if (!rel) return false;
    return rel.pact === 'truce' || rel.pact === 'alliance' || rel.pact === 'vassal';
  }

  /** Força militar bruta de um reino, para medir quem manda em quem. */
  private power(kingdomId: string): number {
    let total = 0;
    for (const a of Object.values(this.state.armies)) {
      if (a.ownerId !== kingdomId) continue;
      for (const n of Object.values(a.units)) total += n ?? 0;
    }
    for (const t of Object.values(this.state.territories)) {
      if (t.ownerId !== kingdomId) continue;
      total += t.defense * 0.4;
    }
    return total;
  }

  /** A mesa: o que dá para propor a este vizinho, e a que preço. */
  offers(kingdomId: string): DiplomacyOffer[] {
    const rel = this.relation(kingdomId);
    if (!rel) return [];
    const coin = this.state.kingdoms[this.state.playerKingdomId].resources.coin;
    const D = DIPLOMACY;
    const afford = (c: number) => (coin >= c ? null : `Faltam ${Math.ceil(c - coin)} moedas`);
    const ratio = this.power(this.state.playerKingdomId) / Math.max(1, this.power(kingdomId));

    const list: DiplomacyOffer[] = [];

    list.push({
      id: 'gift',
      label: 'Mandar um presente',
      hint: `+${D.gift.attitude} de simpatia`,
      coin: D.gift.coin,
      lock:
        rel.giftCooldown > 0
          ? `A carroça volta em ${Math.ceil(rel.giftCooldown)}s`
          : afford(D.gift.coin),
    });

    if (rel.pact === 'neutral' || rel.pact === 'war') {
      list.push({
        id: 'truce',
        label: 'Propor trégua',
        hint: `${D.truce.days} dias sem ataque dos dois lados`,
        coin: D.truce.coin,
        lock:
          rel.attitude < D.truce.minAttitude
            ? `Exige ${D.truce.minAttitude} de simpatia`
            : afford(D.truce.coin),
      });
    }

    if (!rel.married) {
      list.push({
        id: 'marriage',
        label: 'Casamento real',
        hint: 'Laço que não vence, e abre a aliança',
        coin: D.marriage.coin,
        lock:
          rel.pact === 'war'
            ? 'Não se casa em guerra'
            : rel.attitude < D.marriage.minAttitude
              ? `Exige ${D.marriage.minAttitude} de simpatia`
              : afford(D.marriage.coin),
      });
    }

    if (rel.pact !== 'alliance' && rel.pact !== 'vassal') {
      list.push({
        id: 'alliance',
        label: 'Selar aliança',
        hint: 'Eles entram nas suas guerras',
        coin: D.alliance.coin,
        lock:
          rel.married
            ? afford(D.alliance.coin)
            : rel.attitude < D.alliance.minAttitude
              ? `Exige casamento ou ${D.alliance.minAttitude} de simpatia`
              : afford(D.alliance.coin),
      });
    }

    if (rel.pact !== 'vassal') {
      list.push({
        id: 'vassal',
        label: 'Exigir vassalagem',
        hint: `Tributo de ${D.vassal.tributePerMinute} moedas por minuto`,
        coin: 0,
        lock:
          ratio < D.vassal.powerRatio
            ? `Exige ${D.vassal.powerRatio.toFixed(1)}x a força deles (hoje ${ratio.toFixed(1)}x)`
            : null,
      });
    }

    if (rel.pact !== 'war') {
      list.push({
        id: 'war',
        label: 'Declarar guerra',
        hint: 'Rompe tudo o que foi assinado',
        coin: 0,
        lock: null,
      });
    } else {
      list.push({
        id: 'peace',
        label: 'Propor paz',
        hint: 'Volta ao estado neutro',
        coin: D.truce.coin,
        lock: afford(D.truce.coin),
      });
    }

    return list;
  }

  /** Executa uma proposta. Só passa o que a mesa deixou destrancado. */
  act(kingdomId: string, offerId: DiplomacyOffer['id']): DiplomacyResult {
    const rel = this.relation(kingdomId);
    const offer = this.offers(kingdomId).find((o) => o.id === offerId);
    if (!rel || !offer) return { ok: false, message: 'Proposta indisponível.' };
    if (offer.lock) return { ok: false, message: offer.lock };

    const kingdom = this.state.kingdoms[kingdomId];
    const purse = this.state.kingdoms[this.state.playerKingdomId].resources;
    purse.coin -= offer.coin;
    const D = DIPLOMACY;

    switch (offerId) {
      case 'gift':
        rel.attitude = clamp(rel.attitude + D.gift.attitude);
        rel.giftCooldown = D.gift.cooldownSeconds;
        return { ok: true, message: `${kingdom.name} recebeu o presente.` };

      case 'truce':
        rel.pact = 'truce';
        rel.pactDays = D.truce.days;
        return { ok: true, message: `Trégua de ${D.truce.days} dias com ${kingdom.name}.` };

      case 'marriage':
        rel.married = true;
        rel.attitude = clamp(rel.attitude + D.marriage.attitude);
        if (rel.pact === 'neutral') {
          rel.pact = 'truce';
          rel.pactDays = D.truce.days;
        }
        purse.coin += D.marriage.dowryCoin;
        return {
          ok: true,
          message: `Casamento selado com ${kingdom.name}. O dote rendeu ${D.marriage.dowryCoin} moedas.`,
        };

      case 'alliance':
        rel.pact = 'alliance';
        rel.pactDays = 0;
        return { ok: true, message: `${kingdom.name} é sua aliada.` };

      case 'vassal':
        rel.pact = 'vassal';
        rel.pactDays = 0;
        rel.tribute = D.vassal.tributePerMinute;
        rel.attitude = clamp(rel.attitude + D.vassal.attitude);
        return { ok: true, message: `${kingdom.name} dobrou o joelho. O tributo começa a chegar.` };

      case 'war':
        rel.pact = 'war';
        rel.pactDays = 0;
        rel.married = false;
        rel.tribute = 0;
        rel.attitude = clamp(rel.attitude + D.war.attitude);
        return { ok: true, message: `Guerra declarada a ${kingdom.name}.` };

      case 'peace':
        rel.pact = 'neutral';
        rel.pactDays = 0;
        return { ok: true, message: `A guerra com ${kingdom.name} terminou.` };
    }
  }

  /** Simpatia caminha, trégua vence, tributo entra. */
  tick(dtSeconds: number) {
    this.sync();
    const minutes = dtSeconds / 60;
    const purse = this.state.kingdoms[this.state.playerKingdomId].resources;

    for (const rel of Object.values(this.state.relations)) {
      if (rel.giftCooldown > 0) rel.giftCooldown = Math.max(0, rel.giftCooldown - dtSeconds);

      const target = DIPLOMACY.baseline[rel.pact] + (rel.married ? 20 : 0);
      const step = DIPLOMACY.driftPerMinute * minutes;
      if (rel.attitude < target) rel.attitude = Math.min(target, rel.attitude + step);
      else if (rel.attitude > target) rel.attitude = Math.max(target, rel.attitude - step);

      if (rel.pact === 'truce' && rel.pactDays > 0) {
        rel.pactDays -= minutes * (60 / 12);
        if (rel.pactDays <= 0) {
          rel.pactDays = 0;
          rel.pact = 'neutral';
        }
      }

      if (rel.pact === 'vassal' && rel.tribute > 0) purse.coin += rel.tribute * minutes;
    }
  }

  /** Tomar terra deles custa caro na mesa, e rompe o que estava assinado. */
  onTerritoryTaken(fromKingdomId: string | null) {
    if (!fromKingdomId) return;
    const rel = this.relation(fromKingdomId);
    if (!rel) return;
    rel.attitude = clamp(rel.attitude + DIPLOMACY.attitudePerTerritoryTaken);
    if (rel.pact !== 'war') {
      rel.pact = 'war';
      rel.pactDays = 0;
      rel.married = false;
      rel.tribute = 0;
    }
  }

  /** Como o pacto aparece para o jogador. */
  static pactLabel(pact: PactKind): string {
    switch (pact) {
      case 'truce':
        return 'Trégua';
      case 'alliance':
        return 'Aliança';
      case 'vassal':
        return 'Vassalo';
      case 'war':
        return 'Guerra';
      default:
        return 'Neutro';
    }
  }
}

function clamp(v: number): number {
  return Math.max(-100, Math.min(100, v));
}
