/**
 * Paleta única do jogo — medieval cartoon, colorida e legível (§32).
 * Todo desenho do mundo deve puxar cor daqui. Nada de hex solto nas layers.
 */

export const PALETTE = {
  // Água
  oceanDeep: '#155384',
  ocean: '#247bb7',
  oceanShallow: '#4ab3d5',
  surf: '#bfe9f7',
  river: '#3f9fd8',
  riverLight: '#79cbee',

  // Terra
  sand: '#e8d29a',
  plainsLow: '#6fa34a',
  plains: '#83b957',
  plainsHigh: '#a3ca6a',
  fertile: '#b2ce62',
  fertileDark: '#8fb249',
  forest: '#347d42',
  forestDark: '#245c34',
  hills: '#92a45a',
  hillsDark: '#718044',
  rock: '#9aa2ab',
  rockDark: '#767f8a',
  snow: '#f2f6fa',
  marsh: '#648e66',

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
