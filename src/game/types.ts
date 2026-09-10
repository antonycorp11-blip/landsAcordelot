/**
 * Tipos centrais do jogo.
 *
 * Regra de arquitetura: nenhum sistema inventa campos soltos.
 * IDs são strings estáveis (preparado para servidor/multiplayer futuro).
 */

export type TerritoryId = string;
export type KingdomId = string;

export type OwnerKind = 'PLAYER' | 'AI' | 'ONLINE_PLAYER' | 'NEUTRAL' | 'REBEL';

/** Motivo de transferência de território (§19). */
export type ConquestReason =
  | 'MILITARY'
  | 'DIPLOMATIC'
  | 'RELIGIOUS'
  | 'ECONOMIC'
  | 'CULTURAL'
  | 'REBELLION'
  | 'VASSALIZATION'
  | 'SCENARIO';

// ---------------------------------------------------------------------------
// Recursos — cadeia bruto → refinado
// ---------------------------------------------------------------------------

/**
 * Brutos saem do solo; refinados saem de oficinas.
 * Construir e recrutar consome REFINADOS, o que obriga o jogador a montar
 * uma cadeia produtiva em vez de acumular um número só.
 */
export type RawResource = 'food' | 'wood' | 'stone' | 'ore' | 'goldOre';
export type RefinedResource = 'planks' | 'bricks' | 'iron' | 'coin';
export type ResourceKind = RawResource | RefinedResource;

export const RAW_RESOURCES: RawResource[] = ['food', 'wood', 'stone', 'ore', 'goldOre'];
export const REFINED_RESOURCES: RefinedResource[] = ['planks', 'bricks', 'iron', 'coin'];
export const RESOURCE_KINDS: ResourceKind[] = [...RAW_RESOURCES, ...REFINED_RESOURCES];

export type ResourceBag = Record<ResourceKind, number>;

export function emptyBag(): ResourceBag {
  return {
    food: 0,
    wood: 0,
    stone: 0,
    ore: 0,
    goldOre: 0,
    planks: 0,
    bricks: 0,
    iron: 0,
    coin: 0,
  };
}

export function addBag(target: ResourceBag, source: Partial<ResourceBag>, mult = 1): ResourceBag {
  for (const k of RESOURCE_KINDS) target[k] += (source[k] ?? 0) * mult;
  return target;
}

// ---------------------------------------------------------------------------
// Geografia
// ---------------------------------------------------------------------------

export type Biome = 'plains' | 'forest' | 'hills' | 'mountains' | 'fertile' | 'coast' | 'marsh';

export type StrategicTag = 'bridge' | 'mountain_pass' | 'harbor' | 'holy_site' | 'old_capital';

export type Vec2 = { x: number; y: number };

// ---------------------------------------------------------------------------
// Depósitos — os "spots" de recurso visíveis no mapa
// ---------------------------------------------------------------------------

export type DepositKind = 'forest' | 'stone' | 'ore' | 'gold' | 'farmland' | 'fish';

export interface Deposit {
  id: string;
  territoryId: TerritoryId;
  kind: DepositKind;
  position: Vec2;
  /** 0.7 .. 1.4 — multiplica a produção do extrator instalado. */
  richness: number;
  /** Edifício instalado sobre o depósito, se houver. */
  buildingId: string | null;
}

// ---------------------------------------------------------------------------
// Construções
// ---------------------------------------------------------------------------

export type BuildingKind =
  | 'lumberjack'
  | 'quarry'
  | 'iron_mine'
  | 'gold_mine'
  | 'farm'
  | 'sawmill'
  | 'brickworks'
  | 'foundry'
  | 'mint'
  | 'house'
  | 'warehouse'
  | 'market'
  | 'barracks';

export type BuildingCategory = 'extraction' | 'refining' | 'civic' | 'military';

export interface BuildingDef {
  id: BuildingKind;
  name: string;
  short: string;
  category: BuildingCategory;
  description: string;
  /** Se definido, só pode ser construído sobre um depósito deste tipo. */
  deposit?: DepositKind;
  maxLevel: number;
  /** Vagas de trabalho por nível. */
  jobsPerLevel: number;
  /** Custo do nível 1 (níveis seguintes escalam por BUILD.levelCostMult). */
  cost: Partial<ResourceBag>;
  /** Segundos de obra no nível 1. */
  buildTime: number;
  /** Consumo por minuto com todas as vagas preenchidas, no nível 1. */
  input?: Partial<ResourceBag>;
  /** Produção por minuto com todas as vagas preenchidas, no nível 1. */
  output?: Partial<ResourceBag>;
  /** Efeitos passivos. */
  housing?: number;
  storage?: number;
  /** Habilita recrutamento no território. */
  enablesRecruit?: boolean;
  /** Habilita o comércio de caravanas no território. */
  enablesTrade?: boolean;
}

export interface Building {
  id: string;
  defId: BuildingKind;
  territoryId: TerritoryId;
  depositId: string | null;
  /** Posição no mapa (depósito ou vaga urbana). */
  position: Vec2;
  level: number;
  workers: number;
  /** Segundos restantes de obra; 0 = pronto. */
  construction: number;
  /** Nível sendo construído (para upgrades). */
  targetLevel: number;
  /** Última eficiência calculada (0..1) — usada pela UI para explicar gargalos. */
  efficiency: number;
}

// ---------------------------------------------------------------------------
// Militar
// ---------------------------------------------------------------------------

export type UnitKind = 'militia' | 'spearman' | 'archer' | 'swordsman' | 'cavalry' | 'catapult';

export interface UnitDef {
  id: UnitKind;
  name: string;
  description: string;
  hp: number;
  attack: number;
  defense: number;
  speed: number;
  siege: number;
  /** Habitantes retirados da força de trabalho. */
  manpower: number;
  cost: Partial<ResourceBag>;
  /** Manutenção por minuto. */
  upkeep: Partial<ResourceBag>;
  trainTime: number;
  /** Nível mínimo do quartel. */
  requiresBarracks: number;
}

/** O que o exército está fazendo agora. */
export type ArmyState = 'garrison' | 'marching' | 'fighting' | 'returning';

export interface Army {
  id: string;
  name: string;
  ownerId: KingdomId;
  /** Território onde está (guarnição) ou de onde partiu (em marcha). */
  territoryId: TerritoryId;
  units: Partial<Record<UnitKind, number>>;
  /** Moral 0..100 — pesa na batalha e cai com as perdas. */
  morale: number;

  state: ArmyState;
  /** Posição no mapa. Guarnições ficam ao lado do castelo. */
  position: Vec2;
  /** Rota de marcha já resolvida (pontos de mundo). */
  path: Vec2[] | null;
  /** Progresso ao longo da rota, em pontos de mundo percorridos. */
  pathDistance: number;
  /** Comprimento total da rota. */
  pathLength: number;
  /** Destino da ordem atual. */
  targetTerritoryId: TerritoryId | null;
  /** Território para onde recua em caso de derrota ou retorno. */
  homeTerritoryId: TerritoryId;
  /** Comida carregada; acaba e a moral despenca. */
  supplies: number;
  /** Batalha da qual participa. */
  battleId: string | null;
}

/** Uma unidade em campo durante a batalha (agregada por tipo). */
export interface BattleSide {
  kingdomId: KingdomId | null;
  armyIds: string[];
  units: Partial<Record<UnitKind, number>>;
  startUnits: Partial<Record<UnitKind, number>>;
  morale: number;
  /** Bônus de defesa vindo de muralha/terreno (0 para o atacante). */
  fortification: number;
  wallHp: number;
  maxWallHp: number;
}

export interface Battle {
  id: string;
  territoryId: TerritoryId;
  position: Vec2;
  attacker: BattleSide;
  defender: BattleSide;
  /** Segundos até a próxima rodada. */
  roundTimer: number;
  round: number;
  elapsed: number;
  finished: boolean;
  /** Quem venceu, quando terminou. */
  winner: 'attacker' | 'defender' | null;
  /** Linha do tempo curta para a UI. */
  log: string[];
}

export interface TrainingOrder {
  id: string;
  territoryId: TerritoryId;
  unit: UnitKind;
  /** Quantos ainda faltam sair desta ordem. */
  count: number;
  /** Segundos restantes do soldado que está em treino agora. */
  remaining: number;
  /** Tempo de treino de um soldado, para a barra de progresso. */
  total: number;
}

// ---------------------------------------------------------------------------
// Assentamentos
// ---------------------------------------------------------------------------

export type SettlementKind = 'castle' | 'town' | 'village' | 'fort' | 'ruin';

export interface Castle {
  id: string;
  territoryId: TerritoryId;
  name: string;
  kind: SettlementKind;
  level: number;
  hp: number;
  maxHp: number;
  defense: number;
  garrison: number;
  storage: number;
  specialty?: 'iron' | 'trade' | 'holy' | 'mountain' | 'none';
  position: Vec2;
}

// ---------------------------------------------------------------------------
// Território
// ---------------------------------------------------------------------------

/**
 * Vocação da cidade. Território que não comporta quartel pode virar celeiro de
 * pedra; quem refina não precisa extrair. Os recursos já são do reino inteiro,
 * então especializar é escolher no que cada cidade é boa (§5).
 */
export type Vocation = 'balanced' | 'extraction' | 'refining' | 'military' | 'trade';

export interface Territory {
  id: TerritoryId;
  name: string;
  ownerId: KingdomId | null;
  ownerKind: OwnerKind;

  biome: Biome;
  tags: StrategicTag[];
  neighbors: TerritoryId[];

  level: number;
  population: number;
  /** Trabalhadores contratados e disponíveis para alocação. */
  hiredWorkers: number;

  happiness: number;
  loyalty: number;
  stability: number;
  defense: number;

  castleId: string | null;
  buildingIds: string[];
  depositIds: string[];
  /** Vagas urbanas livres para oficinas (posições ao redor do castelo). */
  citySlots: Vec2[];
  /** Segundos até a próxima caravana poder partir do mercado. */
  tradeCooldown: number;
  /** Especialidade escolhida pelo jogador. */
  vocation: Vocation;

  polygon: Vec2[];
  center: Vec2;
  area: number;

  locked: boolean;
  lockReason?: string;
}

// ---------------------------------------------------------------------------
// Reino
// ---------------------------------------------------------------------------

export type AiProfile = 'AGGRESSIVE' | 'ECONOMIC' | 'DEFENSIVE' | 'EXPANSIONIST' | 'NONE';

export interface Kingdom {
  id: KingdomId;
  /** Reino ou Estado. Quem chega com o País já nasce Estado. */
  scale: RealmStage;
  name: string;
  ownerKind: OwnerKind;
  color: string;
  colorDark: string;
  emblem: 'fleur' | 'swords' | 'lion' | 'tree' | 'stag' | 'crown';
  capitalTerritoryId: TerritoryId | null;
  resources: ResourceBag;
  aiProfile: AiProfile;
}

// ---------------------------------------------------------------------------
// Estado global
// ---------------------------------------------------------------------------

export interface WorldMeta {
  width: number;
  height: number;
  seed: number;
}

export interface GameTime {
  elapsed: number;
  day: number;
  speed: 0 | 1 | 2 | 4;
}

export interface GameState {
  version: number;
  meta: WorldMeta;
  time: GameTime;
  playerKingdomId: KingdomId;
  kingdoms: Record<KingdomId, Kingdom>;
  territories: Record<TerritoryId, Territory>;
  castles: Record<string, Castle>;
  deposits: Record<string, Deposit>;
  buildings: Record<string, Building>;
  armies: Record<string, Army>;
  battles: Record<string, Battle>;
  training: TrainingOrder[];
  /** Progresso do tutorial (índice do passo atual). */
  tutorialStep: number;
  tutorialDone: boolean;

  /** Feitos acumulados — base do renome e da crônica. */
  stats: RealmStats;
  /** Índice do título alcançado em TITLES. */
  titleIndex: number;
  /** Ids das entradas de crônica já desbloqueadas, em ordem. */
  chronicle: string[];

  /** Escala atual do domínio (§5). */
  stage: RealmStage;
  /** Quantas ondas do País já foram reveladas (0 = só o reino inicial). */
  waves: number;
  /** Relação com cada reino estrangeiro, por id. */
  relations: Record<string, Relation>;
  /**
   * Uma revelação do País ainda não foi mostrada ao jogador.
   *
   * Vive no save, e não em memória, porque o momento em que o mapa cresce e o
   * momento em que existe uma tela para enquadrá-lo são diferentes — e entre
   * os dois cabe um recarregamento, uma remontagem do React ou um encerramento
   * do app. Perder este sinalizador é perder a única vez que o jogador seria
   * levado a ver os vizinhos novos.
   */
  pendingReveal: boolean;
  /** Nome dado pelo jogador ao Estado, quando promovido. */
  stateName: string | null;
  /** Governador e general escolhidos, com a ordem que cada um segue. */
  governorId: string | null;
  generalId: string | null;
  civilPolicy: CivilPolicy;
  warPolicy: WarPolicy;
  /** Promoção pendente: a tela de fundação ainda não foi respondida. */
  promotionPending: boolean;
}

export type RealmStage = 'kingdom' | 'state';

/**
 * O que existe entre você e um vizinho.
 *
 * `neutral` é o estado natural: ninguém prometeu nada e qualquer um pode
 * marchar. Trégua, aliança e vassalagem travam o ataque nos dois sentidos —
 * é o que faz assinar um pacto custar alguma coisa de verdade.
 */
export type PactKind = 'neutral' | 'truce' | 'alliance' | 'vassal' | 'war';

export interface Relation {
  kingdomId: KingdomId;
  /** -100 (ódio) a 100 (devoção). */
  attitude: number;
  pact: PactKind;
  /** Dias que faltam para a trégua vencer; 0 quando não tem prazo. */
  pactDays: number;
  /** Casamento real: laço que não vence e abre a aliança. */
  married: boolean;
  /** Moedas por minuto que um vassalo manda para a sua capital. */
  tribute: number;
  /** Segundos até poder mandar outro presente. */
  giftCooldown: number;
}

/** Ordem permanente ao governador — cidade, povo e extração. */
export type CivilPolicy = 'celeiros' | 'ordem' | 'crescimento';
/** Ordem permanente ao general — tropa e fronteira. */
export type WarPolicy = 'guerra' | 'fronteira' | 'expansao';

export interface RealmStats {
  battlesWon: number;
  battlesLost: number;
  territoriesTaken: number;
  territoriesLost: number;
  buildingsRaised: number;
  unitsTrained: number;
  caravansSent: number;
  /** Renome ganho fora do mapa: decisões do conselho, feitos únicos. */
  renownGranted: number;
}

export function emptyStats(): RealmStats {
  return {
    battlesWon: 0,
    battlesLost: 0,
    territoriesTaken: 0,
    territoriesLost: 0,
    buildingsRaised: 0,
    unitsTrained: 0,
    caravansSent: 0,
    renownGranted: 0,
  };
}
