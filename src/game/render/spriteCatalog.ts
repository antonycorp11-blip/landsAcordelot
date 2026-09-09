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

export const BUILDING_SPRITE: Partial<Record<BuildingKind, string>> = {
  lumberjack: null as unknown as string, // vetorial: cabana + toras
  sawmill: 'buildings/sawmill',
  quarry: 'buildings/quarry',
  iron_mine: 'buildings/iron_mine',
  gold_mine: 'buildings/gold_mine',
  farm: 'buildings/farm',
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
