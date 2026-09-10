import { DIPLOMACY, TEMPERAMENTS } from '../config/balance';
import { feudsOf, otherSide, rulerOf, type FeudDef, type RulerDef } from '../data/rulers';
import type { GameState, Kingdom, OpinionEntry, PactKind, Relation } from '../types';

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

/** Faixa de humor: escolhe a fala com que o soberano recebe você. */
export type Mood = 'hostil' | 'frio' | 'cordial' | 'leal';

/**
 * DiplomacyManager — a corte dos vizinhos (§17).
 *
 * Do outro lado da mesa há uma pessoa, não um medidor. Cada trono tem nome,
 * casa, história e temperamento, e o temperamento mexe nos números: Torvald
 * despreza presente e só respeita exército; Ravel abre quase tudo por ouro,
 * mas não pode ser vassalo porque a assembleia dele não permite.
 *
 * E a opinião dele sobre você é feita de razões com nome e prazo, nunca de um
 * número solto. Um número não se discute; uma razão, sim — dá para pagar, para
 * esperar passar, ou para não repetir.
 */
export class DiplomacyManager {
  constructor(private state: GameState) {}

  // -- cadastro -------------------------------------------------------------

  sync() {
    for (const k of Object.values(this.state.kingdoms)) {
      if (k.id === this.state.playerKingdomId) continue;
      if (!this.state.relations[k.id]) {
        this.state.relations[k.id] = {
          kingdomId: k.id,
          attitude: 0,
          opinions: [],
          pact: 'neutral',
          pactDays: 0,
          married: false,
          tribute: 0,
          giftCooldown: 0,
        };
      }
      // Saves anteriores às razões nomeadas chegam sem a lista.
      const rel = this.state.relations[k.id];
      if (!Array.isArray(rel.opinions)) rel.opinions = [];
      this.refresh(rel);
    }
  }

  relation(kingdomId: string): Relation | null {
    return this.state.relations[kingdomId] ?? null;
  }

  ruler(kingdomId: string): RulerDef | null {
    return rulerOf(kingdomId);
  }

  feuds(kingdomId: string): FeudDef[] {
    return feudsOf(kingdomId);
  }

  private temper(kingdomId: string) {
    const ruler = rulerOf(kingdomId);
    return TEMPERAMENTS[ruler?.temperament ?? 'calculista'];
  }

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

  // -- opinião --------------------------------------------------------------

  /** Acrescenta uma razão. `days` nulo = enquanto a causa existir. */
  private remember(rel: Relation, id: string, label: string, value: number, days: number | null) {
    rel.opinions.push({ id, label, value, days });
    this.refresh(rel);
  }

  /** Recalcula as razões que dependem do estado do mundo e soma tudo. */
  private refresh(rel: Relation) {
    const t = this.temper(rel.kingdomId);
    const ruler = rulerOf(rel.kingdomId);

    // As razões vivas são recalculadas; as lembranças ficam como estão.
    rel.opinions = rel.opinions.filter((o) => !o.id.startsWith('~'));

    const live: OpinionEntry[] = [];
    const pactValue = DIPLOMACY.baseline[rel.pact];
    if (pactValue !== 0) {
      live.push({ id: '~pacto', label: pactLabel(rel.pact), value: pactValue, days: null });
    }
    if (t.disposition) {
      live.push({
        id: '~temperamento',
        label: `Temperamento ${t.label.toLowerCase()}`,
        value: t.disposition,
        days: null,
      });
    }
    if (rel.married) {
      live.push({ id: '~casamento', label: 'Casamento real', value: 20, days: null });
    }

    // Inimigo do meu inimigo: quem está em guerra com quem ele odeia ganha ponto.
    if (ruler) {
      for (const feud of feudsOf(rel.kingdomId)) {
        const other = otherSide(feud, rel.kingdomId);
        const otherRel = this.state.relations[other];
        const iFightThem = otherRel?.pact === 'war';
        if (feud.kind === 'feud' && iFightThem) {
          live.push({
            id: '~inimigo_comum',
            label: `Guerreia ${this.name(other)}, rival dele`,
            value: DIPLOMACY.inimigoComum,
            days: null,
          });
        }
        if (feud.kind === 'bond' && iFightThem) {
          live.push({
            id: '~aliado_ferido',
            label: `Guerreia ${this.name(other)}, amiga dele`,
            value: -DIPLOMACY.inimigoComum,
            days: null,
          });
        }
      }
    }

    // Tropa acumulada na fronteira dele fala mais alto que qualquer carta.
    const massed = this.troopsOnBorder(rel.kingdomId);
    if (massed >= DIPLOMACY.fronteiraArmadaMin && rel.pact !== 'alliance') {
      live.push({
        id: '~fronteira',
        label: `${massed} soldados na fronteira dele`,
        value: DIPLOMACY.fronteiraArmada,
        days: null,
      });
    }

    rel.opinions = [...live, ...rel.opinions];
    let sum = 0;
    for (const o of rel.opinions) sum += o.value;
    rel.attitude = Math.max(-100, Math.min(100, Math.round(sum)));
  }

  private name(kingdomId: string): string {
    return this.state.kingdoms[kingdomId]?.name ?? kingdomId;
  }

  /** Soldados seus parados em províncias que fazem fronteira com ele. */
  private troopsOnBorder(kingdomId: string): number {
    let total = 0;
    for (const army of Object.values(this.state.armies)) {
      if (army.ownerId !== this.state.playerKingdomId) continue;
      const t = army.territoryId ? this.state.territories[army.territoryId] : null;
      if (!t) continue;
      const touches = t.neighbors.some((n) => this.state.territories[n]?.ownerId === kingdomId);
      if (!touches) continue;
      for (const n of Object.values(army.units)) total += n ?? 0;
    }
    return total;
  }

  /** Como ele te recebe hoje. */
  mood(kingdomId: string): Mood {
    const rel = this.relation(kingdomId);
    const a = rel?.attitude ?? 0;
    if (rel?.pact === 'war' || a <= -35) return 'hostil';
    if (a >= 60) return 'leal';
    if (a >= 20) return 'cordial';
    return 'frio';
  }

  /** A fala de abertura, na voz dele. */
  greeting(kingdomId: string): string {
    const ruler = rulerOf(kingdomId);
    if (!ruler) return '';
    return ruler.voice[this.mood(kingdomId)];
  }

  // -- pactos ---------------------------------------------------------------

  attackBlocked(attackerId: string | null, defenderId: string | null): boolean {
    if (!attackerId || !defenderId || attackerId === defenderId) return false;
    const me = this.state.playerKingdomId;
    const other = attackerId === me ? defenderId : defenderId === me ? attackerId : null;
    if (!other) return false;
    const rel = this.state.relations[other];
    if (!rel) return false;
    return rel.pact === 'truce' || rel.pact === 'alliance' || rel.pact === 'vassal';
  }

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

  // -- a mesa ---------------------------------------------------------------

  offers(kingdomId: string): DiplomacyOffer[] {
    const rel = this.relation(kingdomId);
    if (!rel) return [];
    const t = this.temper(kingdomId);
    const ruler = rulerOf(kingdomId);
    const coin = this.state.kingdoms[this.state.playerKingdomId].resources.coin;
    const D = DIPLOMACY;
    const afford = (c: number) => (coin >= c ? null : `Faltam ${Math.ceil(c - coin)} moedas`);
    const need = (base: number) => Math.round(base * t.demand);
    const short = (base: number) =>
      rel.attitude < need(base) ? `${ruler?.name ?? 'Ele'} exige ${need(base)} de simpatia` : null;
    const ratio = this.power(this.state.playerKingdomId) / Math.max(1, this.power(kingdomId));

    const list: DiplomacyOffer[] = [];

    list.push({
      id: 'gift',
      label: 'Mandar um presente',
      hint: `+${Math.round(D.gift.attitude * t.giftValue)} de simpatia`,
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
        lock: short(D.truce.minAttitude) ?? afford(D.truce.coin),
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
            : (short(D.marriage.minAttitude) ?? afford(D.marriage.coin)),
      });
    }

    if (rel.pact !== 'alliance' && rel.pact !== 'vassal') {
      list.push({
        id: 'alliance',
        label: 'Selar aliança',
        hint: 'Eles entram nas suas guerras',
        coin: D.alliance.coin,
        lock: rel.married
          ? afford(D.alliance.coin)
          : (short(D.alliance.minAttitude) ?? afford(D.alliance.coin)),
      });
    }

    if (rel.pact !== 'vassal') {
      list.push({
        id: 'vassal',
        label: 'Exigir vassalagem',
        hint: `Tributo de ${D.vassal.tributePerMinute} moedas por minuto`,
        coin: 0,
        lock:
          t.vassalRatio === Infinity
            ? `${ruler?.name ?? 'Ele'} não pode aceitar: ${ruler?.traits[1] ?? 'não depende só dele'}`
            : ratio < t.vassalRatio
              ? `Exige ${t.vassalRatio.toFixed(1)}x a força dele (hoje ${ratio.toFixed(1)}x)`
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

  act(kingdomId: string, offerId: DiplomacyOffer['id']): DiplomacyResult {
    const rel = this.relation(kingdomId);
    const offer = this.offers(kingdomId).find((o) => o.id === offerId);
    if (!rel || !offer) return { ok: false, message: 'Proposta indisponível.' };
    if (offer.lock) return { ok: false, message: offer.lock };

    const ruler = rulerOf(kingdomId);
    const who = ruler?.name ?? this.name(kingdomId);
    const t = this.temper(kingdomId);
    const purse = this.state.kingdoms[this.state.playerKingdomId].resources;
    purse.coin -= offer.coin;
    const D = DIPLOMACY;

    switch (offerId) {
      case 'gift': {
        const value = Math.round(D.gift.attitude * t.giftValue);
        this.remember(rel, `presente_${Date.now()}`, 'Presente recente', value, D.memory.presente);
        rel.giftCooldown = D.gift.cooldownSeconds;
        return { ok: true, message: `${who} aceitou o presente.` };
      }

      case 'truce':
        rel.pact = 'truce';
        rel.pactDays = D.truce.days;
        this.refresh(rel);
        return { ok: true, message: `Trégua de ${D.truce.days} dias com ${who}.` };

      case 'marriage':
        rel.married = true;
        if (rel.pact === 'neutral') {
          rel.pact = 'truce';
          rel.pactDays = D.truce.days;
        }
        purse.coin += D.marriage.dowryCoin;
        this.refresh(rel);
        return {
          ok: true,
          message: `Casamento selado com a ${ruler?.house ?? this.name(kingdomId)}. O dote rendeu ${D.marriage.dowryCoin} moedas.`,
        };

      case 'alliance':
        rel.pact = 'alliance';
        rel.pactDays = 0;
        this.refresh(rel);
        return { ok: true, message: `${who} é sua aliada.` };

      case 'vassal':
        rel.pact = 'vassal';
        rel.pactDays = 0;
        rel.tribute = D.vassal.tributePerMinute;
        // Dobrar o joelho humilha, e orgulho não esquece rápido.
        this.remember(
          rel,
          `vassalagem_${Date.now()}`,
          'Foi obrigado a dobrar o joelho',
          Math.round(D.vassal.attitude * t.grudge),
          null,
        );
        return { ok: true, message: `${who} dobrou o joelho. O tributo começa a chegar.` };

      case 'war':
        rel.pact = 'war';
        rel.pactDays = 0;
        rel.married = false;
        rel.tribute = 0;
        this.remember(
          rel,
          `guerra_${Date.now()}`,
          'Guerra declarada por você',
          Math.round(D.war.attitude * t.grudge),
          D.memory.conquista,
        );
        return { ok: true, message: `Guerra declarada a ${who}.` };

      case 'peace':
        rel.pact = 'neutral';
        rel.pactDays = 0;
        this.refresh(rel);
        return { ok: true, message: `A guerra com ${who} terminou.` };
    }
  }

  // -- tempo ----------------------------------------------------------------

  tick(dtSeconds: number) {
    this.sync();
    const minutes = dtSeconds / 60;
    const days = minutes * (60 / 12);
    const purse = this.state.kingdoms[this.state.playerKingdomId].resources;

    for (const rel of Object.values(this.state.relations)) {
      if (rel.giftCooldown > 0) rel.giftCooldown = Math.max(0, rel.giftCooldown - dtSeconds);

      // Lembranças se apagam no ritmo do temperamento; as vivas não têm prazo.
      const forget = this.temper(rel.kingdomId).forget;
      let expired = false;
      for (const o of rel.opinions) {
        if (o.days === null) continue;
        o.days -= days * forget;
        if (o.days <= 0) expired = true;
      }
      if (expired) rel.opinions = rel.opinions.filter((o) => o.days === null || o.days > 0);

      if (rel.pact === 'truce' && rel.pactDays > 0) {
        rel.pactDays -= days;
        if (rel.pactDays <= 0) {
          rel.pactDays = 0;
          rel.pact = 'neutral';
        }
      }

      if (rel.pact === 'vassal' && rel.tribute > 0) purse.coin += rel.tribute * minutes;
      this.refresh(rel);
    }
  }

  /** Tomar terra dele custa caro na mesa, e rompe o que estava assinado. */
  onTerritoryTaken(fromKingdomId: string | null, territoryName: string) {
    if (!fromKingdomId) return;
    const rel = this.relation(fromKingdomId);
    if (!rel) return;
    const t = this.temper(fromKingdomId);
    if (rel.pact !== 'war') {
      rel.pact = 'war';
      rel.pactDays = 0;
      rel.married = false;
      rel.tribute = 0;
    }
    this.remember(
      rel,
      `conquista_${Date.now()}`,
      `Você tomou ${territoryName}`,
      Math.round(DIPLOMACY.attitudePerTerritoryTaken * t.grudge),
      DIPLOMACY.memory.conquista,
    );
  }

  static pactLabel(pact: PactKind): string {
    return pactLabel(pact);
  }
}

function pactLabel(pact: PactKind): string {
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
