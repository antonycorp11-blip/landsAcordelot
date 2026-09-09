/**
 * Paleta única do jogo — medieval cartoon, colorida e legível (§32).
 * Todo desenho do mundo deve puxar cor daqui. Nada de hex solto nas layers.
 */

export const PALETTE = {
  // Água
  oceanDeep: '#1d5f9c',
  ocean: '#2b7ec4',
  oceanShallow: '#48a8de',
  surf: '#bfe9f7',
  river: '#3f9fd8',
  riverLight: '#79cbee',

  // Terra
  sand: '#e8d29a',
  plainsLow: '#7ab84f',
  plains: '#8cc85c',
  plainsHigh: '#a2d76c',
  fertile: '#b9d95c',
  fertileDark: '#93bb43',
  forest: '#3f8f47',
  forestDark: '#2f7038',
  hills: '#9aab55',
  hillsDark: '#7d8f44',
  rock: '#9aa2ab',
  rockDark: '#767f8a',
  snow: '#f2f6fa',
  marsh: '#6f9a5f',

  // Estruturas
  wall: '#d9d6cd',
  wallShadow: '#a7a49b',
  wallDark: '#8c8981',
  roof: '#c96a4a',
  roofDark: '#a2503a',
  wood: '#a5723f',
  woodDark: '#7d5530',
  thatch: '#d9b463',
  gold: '#f2c33d',
  road: '#dcc79a',
  roadDark: '#a68a5d',

  // Overlay / UI no mundo
  shadow: 'rgba(20,32,48,0.22)',
  lockedVeil: 'rgba(18,26,40,0.45)',
  fogEdge: 'rgba(226,238,250,0.85)',
  neutral: '#b9c2cd',
  neutralDark: '#8b95a2',
  selection: '#ffffff',
} as const;

/** Cores de bioma usadas na pintura do terreno. */
export const BIOME_COLORS: Record<string, [string, string]> = {
  plains: [PALETTE.plainsLow, PALETTE.plainsHigh],
  fertile: [PALETTE.fertileDark, PALETTE.fertile],
  forest: [PALETTE.forestDark, PALETTE.forest],
  hills: [PALETTE.hillsDark, PALETTE.hills],
  mountains: [PALETTE.rockDark, PALETTE.rock],
  coast: [PALETTE.plains, PALETTE.sand],
  marsh: [PALETTE.marsh, PALETTE.plainsLow],
};
