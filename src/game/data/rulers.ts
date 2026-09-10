import feudsRaw from './feuds.json';
import rulersRaw from './rulers.json';
import type { Temperament } from '../config/balance';

/** Quem senta no trono do outro lado da mesa. */
export interface RulerDef {
  kingdomId: string;
  name: string;
  epithet: string;
  house: string;
  title: string;
  portrait: string;
  temperament: Temperament;
  creed: string;
  history: string;
  traits: string[];
  /** Fala de abertura por faixa de opinião. */
  voice: { hostil: string; frio: string; cordial: string; leal: string };
  /** Respostas de audiência: lore que se obtém conversando, não lendo menu. */
  topics: { casa: string; querer: string; guerra: string };
}

/** Uma história antiga entre dois domínios: rancor ou laço. */
export interface FeudDef {
  id: string;
  kind: 'feud' | 'bond';
  a: string;
  b: string;
  title: string;
  text: string;
}

export const RULERS = rulersRaw as unknown as RulerDef[];
export const FEUDS = feudsRaw as unknown as FeudDef[];

const BY_KINGDOM = new Map(RULERS.map((r) => [r.kingdomId, r]));

export function rulerOf(kingdomId: string): RulerDef | null {
  return BY_KINGDOM.get(kingdomId) ?? null;
}

/** Histórias em que este domínio aparece. */
export function feudsOf(kingdomId: string): FeudDef[] {
  return FEUDS.filter((f) => f.a === kingdomId || f.b === kingdomId);
}

/** O outro lado de uma história. */
export function otherSide(feud: FeudDef, kingdomId: string): string {
  return feud.a === kingdomId ? feud.b : feud.a;
}
