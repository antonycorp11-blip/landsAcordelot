import type { BuildingKind, Castle, DepositKind, UnitKind } from '../types';

/**
 * Catálogo: liga entidades do jogo aos sprites exportados em /public/assets.
 * Quando não existe arte para algo, o valor é null e o renderer usa o
 * desenho vetorial de fallback (§59 — placeholder coerente, nunca retângulo).
 */

export function settlementSprite(castle: Castle): string | null {
  switch (castle.kind) {
    case 'village':
      return 'settlements/village';
    case 'town':
      // Só quem vive do mar ganha a arte portuária.
      return castle.specialty === 'trade' ? 'settlements/harbor_town' : 'settlements/village';
    case 'fort':
      return 'settlements/castle_l2';
    case 'ruin':
      return 'settlements/ruin';
    case 'castle':
      if (castle.level >= 5) return 'settlements/walled_city';
      if (castle.level === 4) return 'settlements/castle_l5';
      if (castle.level === 3) return 'settlements/castle_l3';
      return 'settlements/castle_l2';
    default:
      return null;
  }
}

/** Escala do assentamento por nível — o castelo cresce de verdade (§9/§33). */
export function settlementScale(castle: Castle): number {
  const base =
    castle.kind === 'village' ? 0.6 : castle.kind === 'town' ? (castle.specialty === 'trade' ? 0.72 : 0.78) : 0.68;
  return base * (0.82 + castle.level * 0.07);
}

/**
 * Arte por construção. O que ainda não tem sprite dedicado cai no desenho
 * vetorial de fallback — basta acrescentar a chave aqui quando o PNG chegar.
 */
export const BUILDING_SPRITE: Partial<Record<BuildingKind, string>> = {
  lumberjack: 'buildings/lumberjack',
  sawmill: 'buildings/sawmill',
  quarry: 'buildings/quarry',
  iron_mine: 'buildings/iron_mine',
  gold_mine: 'buildings/gold_mine',
  farm: 'buildings/farm',
  brickworks: 'buildings/brickworks',
  foundry: 'buildings/foundry',
  mint: 'buildings/mint',
  house: 'buildings/house',
  warehouse: 'buildings/warehouse',
  market: 'buildings/market',
  // Enquanto o quartel de pedra não chega, o acampamento militar dá o recado.
  barracks: 'buildings/war_camp',
};

/**
 * Variações da mesma construção. Duas praças de mercado lado a lado ficavam
 * idênticas; a variante é escolhida pelo id do prédio, então é estável.
 */
export const BUILDING_VARIANTS: Partial<Record<BuildingKind, string[]>> = {
  market: ['buildings/market', 'buildings/market_b', 'buildings/market_c'],
};

/** Sprite da construção, já resolvendo a variante quando existir. */
export function buildingSprite(defId: BuildingKind, buildingId: string): string | undefined {
  const variants = BUILDING_VARIANTS[defId];
  if (variants && variants.length > 0) {
    let h = 0;
    for (let i = 0; i < buildingId.length; i++) h = (h * 31 + buildingId.charCodeAt(i)) >>> 0;
    return variants[h % variants.length];
  }
  return BUILDING_SPRITE[defId];
}

/** Brasão de cada reino, quando existir arte dedicada. */
export const KINGDOM_CREST: Record<string, string> = {
  k_valdoria: 'crests/valdoria',
  k_karneth: 'crests/karneth',
  k_aurenna: 'crests/aurenna',
  k_silvarden: 'crests/silvarden',
  k_morvath: 'crests/morvath',
};

export const UNIT_SPRITE: Record<UnitKind, string> = {
  militia: 'units/militia',
  spearman: 'units/spearman',
  archer: 'units/archer',
  swordsman: 'units/swordsman',
  cavalry: 'units/cavalry',
  catapult: 'units/catapult',
};

/** Ícone do trabalhador de cada prédio — usado na UI de mão de obra. */
export const BUILDING_WORKER: Partial<Record<BuildingKind, string>> = {
  lumberjack: 'people/lumberjack',
  sawmill: 'people/carpenter',
  quarry: 'people/mason',
  iron_mine: 'people/miner',
  gold_mine: 'people/gold_miner',
  farm: 'people/farmer',
  brickworks: 'people/mason',
  foundry: 'people/smith',
  mint: 'people/gold_miner',
  warehouse: 'people/carpenter',
  barracks: 'people/smith',
  market: 'people/weaver',
};

export const DEPOSIT_LABEL: Record<DepositKind, string> = {
  forest: 'Floresta',
  stone: 'Pedra',
  ore: 'Minério de ferro',
  gold: 'Veio de ouro',
  farmland: 'Terra fértil',
  fish: 'Pesqueiro',
};

export const DEPOSIT_COLOR: Record<DepositKind, string> = {
  forest: '#4bb35f',
  stone: '#b9c2cd',
  ore: '#8894a8',
  gold: '#f2c33d',
  farmland: '#e3c258',
  fish: '#48a8de',
};

/** Sprites carregados logo na abertura (o resto entra sob demanda). */
export const PRELOAD_KEYS = [
  'settlements/castle_l3',
  'settlements/castle_l2',
  'settlements/village',
  'settlements/harbor_town',
  'settlements/ruin',
  'settlements/walled_city',
  'settlements/castle_l5',
  'buildings/farm',
  'buildings/sawmill',
  'buildings/quarry',
  'buildings/iron_mine',
  'buildings/gold_mine',
  'nature/grove_wide',
  'nature/grove_mixed',
  'nature/tree_big',
  'nature/tree_oak',
  'terrain/mountain_snow',
  'terrain/mountain_rock',
  'terrain/boulders',
  'units/militia',
  'units/spearman',
  'units/archer',
  'portraits/king',
];
