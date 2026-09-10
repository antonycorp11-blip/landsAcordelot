/**
 * Balanceamento centralizado (§43). Nenhum número mágico espalhado no código.
 */

import type { ResourceBag } from '../types';

export const WORLD = {
  width: 5200,
  height: 3000,
  cell: 16,
  chunkSize: 1024,
  seed: 20260909,
} as const;

/**
 * Qualidade adaptativa (§40). O celular não aguenta o mesmo orçamento de
 * pixels do desktop: começamos mais baixo e caímos mais se o quadro sofrer.
 */
export const QUALITY = {
  maxDprDesktop: 2,
  maxDprMobile: 1.5,
  /** Abaixo disto por `dropAfterSeconds`, reduz a resolução interna. */
  minFps: 34,
  dropAfterSeconds: 3,
  /** Passo e piso da redução. */
  scaleStep: 0.15,
  minScale: 0.6,
  /** Chunks de terreno mantidos em memória. */
  chunkCacheDesktop: 48,
  chunkCacheMobile: 16,
} as const;

export const CAMERA = {
  minZoom: 0.22,
  maxZoom: 2.4,
  startZoom: 0.62,
  zoomStep: 1.12,
  lodProps: 0.5,
  lodPeople: 0.85,
  lodLabels: 0.34,
  /** A partir daqui aparecem ícones de depósito e barras de obra. */
  lodBuildings: 0.42,
  panInertia: 0.86,
} as const;

export const TIME = {
  /** Segundos reais para 1 dia de jogo em velocidade 1x. */
  secondsPerDay: 12,
  /** Calendário: 4 estações de 30 dias. Puro sabor, derivado do dia. */
  daysPerSeason: 30,
  startYear: 1124,
  /**
   * Passo fixo da simulação econômica. Não roda a cada frame: acumula e
   * processa em blocos, o que mantém o custo estável em mapas grandes (§77).
   */
  economyStep: 0.25,
  /** Frequência do passo de simulação (independente do quadro de vídeo). */
  simIntervalMs: 200,
  /** Maior fatia processada de uma vez — evita travar ao voltar de uma ausência. */
  maxSimChunk: 1,
  /** Teto de recuperação de tempo real por chamada (5 min de progresso offline). */
  maxCatchUpSeconds: 300,
} as const;

/** Recursos iniciais do jogador (§68). */
export const STARTING_RESOURCES: ResourceBag = {
  food: 320,
  wood: 260,
  stone: 140,
  ore: 40,
  goldOre: 0,
  planks: 60,
  bricks: 40,
  iron: 15,
  coin: 400,
};

/** Recursos iniciais de um reino de IA (ainda não simulados a fundo). */
export const AI_STARTING_RESOURCES: ResourceBag = {
  food: 400,
  wood: 300,
  stone: 200,
  ore: 60,
  goldOre: 10,
  planks: 80,
  bricks: 60,
  iron: 30,
  coin: 500,
};

export const BUILD = {
  /**
   * Custo do nível N = custo base * mult^(N-1).
   * Subir tem que doer: um prédio nível 4 custa ~15x o nível 1, o que faz o
   * jogador escolher onde investir em vez de evoluir tudo por inércia.
   */
  levelCostMult: 2.45,
  levelTimeMult: 1.7,
  /**
   * A partir do nível 2 a obra também cobra refinados, proporcional ao nível.
   * É o que liga a cadeia produtiva à progressão: sem serraria e olaria
   * rodando, nada evolui.
   */
  refinedPerLevel: { planks: 18, bricks: 12 } as Record<string, number>,
  refinedFromLevel: 2,
  /** Produção do nível N = base * N. */
  levelOutputMult: 1,
  /** Devolução ao demolir. */
  refundRatio: 0.4,
} as const;

export const WORKFORCE = {
  /** Habitantes necessários para liberar 1 vaga de trabalhador. */
  populationPerWorker: 25,
  /** Custo de contratação (uma vez). */
  hireCost: 30,
  /** Salário por trabalhador empregado, por minuto. */
  wagePerMinute: 0.55,
  /** Eficiência mínima de um prédio sem trabalhador nenhum. */
  idleEfficiency: 0,
} as const;

export const ECONOMY = {
  /** Imposto por habitante por minuto, modulado pela felicidade. */
  taxPerPopPerMinute: 0.012,
  /** Consumo de comida por habitante por minuto. */
  foodPerPopPerMinute: 0.01,
  /** Crescimento populacional por minuto quando há comida e moradia. */
  growthPerMinute: 0.008,
  /** Perda populacional por minuto em fome. */
  starvationPerMinute: 0.02,
  /** Moradia garantida pelo próprio assentamento, por nível. */
  baseHousingPerLevel: 900,
} as const;

/** Multiplicador de produção conforme nível do castelo do território. */
export const CASTLE_LEVEL_YIELD_MULT = [1, 1, 1.12, 1.24, 1.38, 1.55];

export const CASTLE_LEVELS = [
  null,
  { maxHp: 600, defense: 12, storage: 1500, garrison: 40 },
  { maxHp: 1000, defense: 20, storage: 2400, garrison: 80 },
  { maxHp: 1600, defense: 32, storage: 3600, garrison: 140 },
  { maxHp: 2400, defense: 48, storage: 5200, garrison: 220 },
  { maxHp: 3600, defense: 70, storage: 8000, garrison: 340 },
] as const;

export const MILITARY = {
  /** Teto de soldados por ordem — evita fila de mil por engano. */
  maxPerOrder: 50,
  /** Moral inicial de um exército recém-formado. */
  startingMorale: 70,
  /** Habitantes por ponto de manpower. */
  populationPerManpower: 8,
} as const;

/**
 * Reivindicação pacífica (§19 — conquista econômica/diplomática).
 * Só vale para territórios neutros; domínios de outros reinos exigem
 * campanha militar com exércitos reais.
 */
export const CLAIM = {
  coinBase: 150,
  coinPerDefense: 14,
  foodBase: 80,
  foodPerPop: 0.09,
} as const;

/**
 * Comércio (§12). Cada recurso tem um valor relativo; a caravana cobra uma
 * margem que cai conforme o mercado evolui. Volume e intervalo evitam que o
 * mercado vire um botão de converter recurso infinito.
 */
export const TRADE = {
  /** Valor relativo por unidade. Ouro é a referência de troca. */
  value: {
    food: 1,
    wood: 1,
    stone: 1.3,
    ore: 2.2,
    goldOre: 4.5,
    planks: 2.6,
    bricks: 3.2,
    iron: 6.5,
    coin: 0.5,
  } as Record<string, number>,
  /** Margem da caravana por nível do mercado. */
  spreadByLevel: [0.35, 0.28, 0.22, 0.16, 0.1],
  /** Valor máximo movido por caravana, por nível. */
  capacityByLevel: [0, 220, 420, 700, 1100],
  /** Intervalo entre caravanas, em segundos. */
  cooldownSeconds: 25,
} as const;

/**
 * Vocações. Cada uma dá com uma mão e tira com a outra — é escolha, não upgrade.
 * O jogador designa uma cidade para extrair e outra para refinar; o estoque já
 * é comum ao reino, então o material flui sozinho entre elas.
 */
export const VOCATIONS = {
  balanced: {
    name: 'Equilibrada',
    hint: 'Sem especialidade: tudo funciona no ritmo normal.',
    extraction: 1,
    refining: 1,
    trainSpeed: 1,
    morale: 0,
    tradeSpread: 0,
  },
  extraction: {
    name: 'Extração',
    hint: 'Minas, pedreiras e lenhadores rendem muito mais; as oficinas rendem pouco.',
    extraction: 1.35,
    refining: 0.55,
    trainSpeed: 1,
    morale: 0,
    tradeSpread: 0,
  },
  refining: {
    name: 'Refino',
    hint: 'Serraria, olaria, fundição e moeda rendem mais; o que sai do solo rende menos.',
    extraction: 0.6,
    refining: 1.35,
    trainSpeed: 1,
    morale: 0,
    tradeSpread: 0,
  },
  military: {
    name: 'Praça de armas',
    hint: 'Treina mais rápido e a guarnição luta com mais firmeza; a produção civil cai.',
    extraction: 0.8,
    refining: 0.8,
    trainSpeed: 0.65,
    morale: 12,
    tradeSpread: 0,
  },
  trade: {
    name: 'Entreposto',
    hint: 'Caravanas cobram menos e levam mais; a produção própria cai um pouco.',
    extraction: 0.85,
    refining: 0.85,
    trainSpeed: 1,
    morale: 0,
    tradeSpread: -0.1,
  },
} as const;

/**
 * Títulos do reino (§5 — progressão de escala).
 *
 * Cada degrau é conquistado por renome e paga de volta em algo concreto:
 * armazém maior, salário menor, tropa mais firme, anexação mais barata.
 * Título que só muda o nome na tela não é progressão, é enfeite.
 */
export const TITLES = [
  { renown: 0, name: 'Senhor', scale: 'Castelo', storage: 0, wageCut: 0, morale: 0, claimCut: 0 },
  { renown: 450, name: 'Barão', scale: 'Baronia', storage: 900, wageCut: 0.05, morale: 2, claimCut: 0.05 },
  { renown: 1100, name: 'Visconde', scale: 'Viscondado', storage: 2000, wageCut: 0.1, morale: 4, claimCut: 0.1 },
  { renown: 2200, name: 'Conde', scale: 'Condado', storage: 3600, wageCut: 0.14, morale: 6, claimCut: 0.15 },
  { renown: 4000, name: 'Marquês', scale: 'Marca', storage: 6000, wageCut: 0.18, morale: 8, claimCut: 0.2 },
  { renown: 6800, name: 'Duque', scale: 'Ducado', storage: 9500, wageCut: 0.22, morale: 11, claimCut: 0.25 },
  { renown: 10500, name: 'Grão-Duque', scale: 'Grão-Ducado', storage: 14000, wageCut: 0.26, morale: 14, claimCut: 0.3 },
  { renown: 15500, name: 'Rei', scale: 'Reino de Acordelot', storage: 20000, wageCut: 0.3, morale: 18, claimCut: 0.35 },
] as const;

/** Peso de cada feito no cálculo do renome. */
export const RENOWN = {
  perTerritory: 120,
  perPopulation: 0.05,
  perBuilding: 14,
  perCastleLevel: 45,
  perBattleWon: 90,
  perTerritoryTaken: 60,
  perUnitTrained: 3,
} as const;

export const SAVE = {
  key: 'acord-kingdoms:save:v4',
  autosaveEverySeconds: 20,
} as const;

/**
 * Marcha e logística (§16). Guerra tem custo: mobilizar consome ouro e comida,
 * a distância pesa e um exército sem suprimento perde moral.
 */
export const MARCH = {
  /** Unidades de mundo por segundo, para velocidade de unidade 1. */
  baseSpeed: 34,
  /** Custo fixo de mobilização por soldado. */
  mobilizeCoinPerUnit: 3,
  mobilizeFoodPerUnit: 3,
  /** Comida carregada por soldado ao partir. */
  suppliesPerUnit: 7,
  /** Consumo de comida por soldado por minuto em marcha. */
  supplyBurnPerUnitPerMinute: 1.1,
  /** Queda de moral por minuto quando o suprimento acaba. */
  starvedMoraleLossPerMinute: 14,
  /** Moral recuperada por minuto dentro do próprio território. */
  moraleRecoveryPerMinute: 6,
} as const;

/**
 * Batalha (§18). Não é um RTS: rodadas curtas, resultado por atributos.
 * O objetivo é responder "vale a pena vencer?", não microgerenciar tropas.
 */
export const BATTLE = {
  /** Segundos entre rodadas. */
  roundSeconds: 1.4,
  /** Fração da força que vira dano por rodada. */
  damagePerRound: 0.16,
  /** Multiplicador de defesa por nível de castelo. */
  fortPerCastleLevel: 0.09,
  /** Bônus de defesa por bioma difícil. */
  terrainBonus: { mountains: 0.25, hills: 0.15, forest: 0.1, marsh: 0.1 } as Record<string, number>,
  /** Muralha absorve dano até ser quebrada por cerco. */
  wallHpPerCastleLevel: 260,
  /** Moral perdida a cada 10% de baixas. */
  moraleLossPerLossRatio: 55,
  /** Abaixo disto o exército debanda. */
  routMorale: 22,
  /** Teto de rodadas — evita batalha eterna. */
  maxRounds: 40,
  /** Fração das tropas derrotadas que consegue recuar. */
  retreatSurvival: 0.35,
} as const;

/**
 * IA dos reinos (§30/§77). Pensa em intervalos, não a cada quadro.
 */
export const AI = {
  thinkIntervalSeconds: 6,
  /** Reserva mínima de moedas que a IA não gasta. */
  coinReserve: 120,
  /** Só ataca com esta vantagem de poder estimada. */
  attackPowerRatio: 1.45,
  /** Tamanho mínimo de exército para uma campanha. */
  minCampaignUnits: 10,
  /** Chance por decisão, por perfil. */
  profiles: {
    AGGRESSIVE: { build: 0.35, recruit: 0.5, attack: 0.9 },
    ECONOMIC: { build: 0.9, recruit: 0.2, attack: 0.25 },
    DEFENSIVE: { build: 0.6, recruit: 0.45, attack: 0.15 },
    EXPANSIONIST: { build: 0.55, recruit: 0.4, attack: 0.6 },
    NONE: { build: 0, recruit: 0, attack: 0 },
  } as Record<string, { build: number; recruit: number; attack: number }>,
} as const;
