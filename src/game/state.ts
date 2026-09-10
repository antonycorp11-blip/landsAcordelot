import countriesRaw from './data/countries.json';
import kingdomsRaw from './data/kingdoms.json';
import territoriesRaw from './data/territories.json';
import type { KingdomDef, TerritoryDef } from './data/schema';
import { BUILDING_DEFS } from './data/defs';
import { AI_STARTING_RESOURCES, CASTLE_LEVELS, MILITARY, STARTING_RESOURCES, WORLD } from './config/balance';
import { emptyStats } from './types';
import type {
  Army,
  Building,
  BuildingKind,
  Castle,
  Deposit,
  GameState,
  Kingdom,
  Territory,
  UnitKind,
  Vec2,
} from './types';
import {
  KINGDOM_FRAME,
  buildWorld,
  type BuiltWorld,
  type LandAnchor,
  type TerritorySeedInput,
  type WorldFrame,
} from './world/WorldBuilder';

const TERRITORY_DEFS = territoriesRaw as TerritoryDef[];
const KINGDOM_DEFS = kingdomsRaw as KingdomDef[];

/**
 * Ondas de expansão (§5).
 *
 * O País não aparece inteiro de uma vez: cada onda revela os vizinhos que
 * fazem fronteira com o que você já domina, cresce o canvas o bastante para
 * caberem, e liga as duas malhas por passagens declaradas. O quadro original
 * nunca se move em coordenadas de quadro — só ganha moldura em volta.
 */
export interface CountryWave {
  id: string;
  title: string;
  frame: { width: number; height: number; originX: number; originY: number };
  land: LandAnchor[];
  sea: LandAnchor[];
  /** Pares de territórios que passam a fazer fronteira. */
  bridges: [string, string][];
  states: { kingdom: KingdomDef; territories: TerritoryDef[] }[];
}

export const COUNTRY_WAVES = countriesRaw as unknown as CountryWave[];

/** Quantas ondas existem para revelar além do reino inicial. */
export const MAX_WAVES = COUNTRY_WAVES.length;

/** Quadro e defs válidos para um dado número de ondas reveladas. */
function composition(waves: number) {
  const active = COUNTRY_WAVES.slice(0, Math.max(0, Math.min(waves, MAX_WAVES)));
  const last = active[active.length - 1];

  const frame: WorldFrame = last
    ? {
        ...last.frame,
        land: active.flatMap((w) => w.land),
        sea: active.flatMap((w) => w.sea),
      }
    : KINGDOM_FRAME;

  const territoryDefs: TerritoryDef[] = TERRITORY_DEFS.map((d) => ({ ...d, neighbors: [...d.neighbors] }));
  const kingdomDefs: KingdomDef[] = [...KINGDOM_DEFS];
  for (const wave of active) {
    for (const st of wave.states) {
      kingdomDefs.push(st.kingdom);
      for (const t of st.territories) territoryDefs.push({ ...t, neighbors: [...t.neighbors] });
    }
  }

  // Passagens: fronteira vale nos dois sentidos, senão a regra §6 trava um lado.
  const byId = new Map(territoryDefs.map((d) => [d.id, d]));
  for (const wave of active) {
    for (const [a, b] of wave.bridges) {
      const ta = byId.get(a);
      const tb = byId.get(b);
      if (!ta || !tb) continue;
      if (!ta.neighbors.includes(b)) ta.neighbors.push(b);
      if (!tb.neighbors.includes(a)) tb.neighbors.push(a);
    }
  }

  return { frame, territoryDefs, kingdomDefs };
}

export const STATE_VERSION = 4;

export interface WorldBundle {
  state: GameState;
  world: BuiltWorld;
}

/** Quadro ativo para um dado número de ondas reveladas. */
export function frameFor(waves: number): WorldFrame {
  return composition(waves).frame;
}

/**
 * Cresce o mapa sem recomeçar o jogo (§5, §97).
 *
 * Reconstrói a geometria com o quadro maior e transplanta o reino vivo para
 * dentro dela: o relevo do quadro original é idêntico, então basta deslocar o
 * que guarda posição absoluta e reler a geometria por id. Os territórios novos
 * entram inteiros — castelo, oficinas e guarnição — vindos da geração nova.
 *
 * Devolve o deslocamento aplicado, que a câmera precisa para não saltar.
 */
export function expandWorld(live: GameState, waves: number): { world: BuiltWorld; dx: number; dy: number } {
  const before = frameFor(live.waves);
  const fresh = createWorld(waves);
  const after = frameFor(waves);
  const dx = after.originX - before.originX;
  const dy = after.originY - before.originY;

  const shift = (p: Vec2) => {
    p.x += dx;
    p.y += dy;
  };

  for (const b of Object.values(live.buildings)) shift(b.position);
  for (const a of Object.values(live.armies)) {
    shift(a.position);
    if (a.path) for (const p of a.path) shift(p);
  }

  // Depósitos: o conjunto novo manda na posição, o antigo manda no que já
  // estava construído em cima. O id é derivado do conteúdo, então casa.
  const occupied = new Map<string, string | null>();
  for (const [id, d] of Object.entries(live.deposits)) occupied.set(id, d.buildingId);
  live.deposits = fresh.state.deposits;
  for (const [id, buildingId] of occupied) {
    const d = live.deposits[id];
    if (d && buildingId && live.buildings[buildingId]) d.buildingId = buildingId;
  }

  // Territórios que já existiam: geometria nova, história antiga.
  for (const t of Object.values(live.territories)) {
    const src = fresh.state.territories[t.id];
    if (!src) continue;
    t.polygon = src.polygon;
    t.center = src.center;
    t.area = src.area;
    t.citySlots = src.citySlots;
    t.depositIds = src.depositIds;
    t.neighbors = src.neighbors;
    const castle = t.castleId ? live.castles[t.castleId] : null;
    const srcCastle = src.castleId ? fresh.state.castles[src.castleId] : null;
    if (castle && srcCastle) castle.position = srcCastle.position;
  }

  // Vizinhos novos entram inteiros: reino, província, castelo, oficinas e
  // guarnição. O que já era seu não é tocado.
  const arrivals = new Set(
    Object.keys(fresh.state.territories).filter((id) => !live.territories[id]),
  );

  for (const [id, k] of Object.entries(fresh.state.kingdoms)) {
    if (!live.kingdoms[id]) live.kingdoms[id] = k;
  }
  for (const id of arrivals) {
    live.territories[id] = fresh.state.territories[id];
    const castleId = fresh.state.territories[id].castleId;
    if (castleId) live.castles[castleId] = fresh.state.castles[castleId];
  }
  for (const [id, b] of Object.entries(fresh.state.buildings)) {
    if (arrivals.has(b.territoryId)) live.buildings[id] = b;
  }
  for (const [id, a] of Object.entries(fresh.state.armies)) {
    if (a.territoryId && arrivals.has(a.territoryId)) live.armies[id] = a;
  }

  live.waves = waves;
  live.meta.width = fresh.world.width;
  live.meta.height = fresh.world.height;

  return { world: fresh.world, dx, dy };
}

/** Constrói geometria + estado inicial a partir dos JSONs de dados. */
export function createWorld(waves = 0): WorldBundle {
  const { frame, territoryDefs, kingdomDefs } = composition(waves);

  // As sementes vivem em coordenadas de quadro; o mundo trabalha em canvas.
  const seeds: TerritorySeedInput[] = territoryDefs.map((d) => ({
    id: d.id,
    seed: { x: d.seed.x + frame.originX, y: d.seed.y + frame.originY },
    weight: d.weight,
    biome: d.biome,
    ...{ neighbors: d.neighbors, features: d.features },
  }));

  const world = buildWorld(seeds, frame);

  const kingdoms: Record<string, Kingdom> = {};
  for (const k of kingdomDefs) {
    kingdoms[k.id] = {
      id: k.id,
      name: k.name,
      ownerKind: k.ownerKind,
      color: k.color,
      colorDark: k.colorDark,
      emblem: k.emblem,
      capitalTerritoryId: k.capitalTerritoryId,
      aiProfile: k.aiProfile,
      scale: k.scale ?? 'kingdom',
      resources: { ...(k.ownerKind === 'PLAYER' ? STARTING_RESOURCES : AI_STARTING_RESOURCES) },
    };
  }

  const territories: Record<string, Territory> = {};
  const castles: Record<string, Castle> = {};
  const deposits: Record<string, Deposit> = {};
  const buildings: Record<string, Building> = {};
  const armies: Record<string, Army> = {};

  // Depósitos gerados pelo mundo.
  //
  // O id é derivado do território e do tipo, nunca da posição na lista: um id
  // posicional fazia qualquer mudança na geração do mundo apontar um save
  // antigo para o depósito errado.
  const depCount: Record<string, number> = {};
  const depositsByTerritory: Record<string, string[]> = {};
  for (const d of world.deposits) {
    const slot = `${d.territoryId}_${d.kind}`;
    const n = (depCount[slot] = (depCount[slot] ?? 0) + 1);
    const id = `dep_${slot}_${n}`;
    deposits[id] = {
      id,
      territoryId: d.territoryId,
      kind: d.kind,
      position: d.position,
      richness: d.richness,
      buildingId: null,
    };
    (depositsByTerritory[d.territoryId] ??= []).push(id);
  }

  for (const d of territoryDefs) {
    const owner = d.owner ? kingdoms[d.owner] : null;
    const fallback = { x: d.seed.x + frame.originX, y: d.seed.y + frame.originY };
    const anchor = world.anchors[d.id] ?? fallback;
    const castleId = `castle_${d.id}`;
    const lvl = Math.max(1, Math.min(5, d.settlement.level));
    const stats = CASTLE_LEVELS[lvl]!;

    castles[castleId] = {
      id: castleId,
      territoryId: d.id,
      name: d.settlement.name,
      kind: d.settlement.kind,
      level: lvl,
      hp: stats.maxHp,
      maxHp: stats.maxHp,
      defense: stats.defense,
      garrison: stats.garrison,
      storage: stats.storage,
      specialty: d.settlement.specialty ?? 'none',
      position: anchor,
    };

    territories[d.id] = {
      id: d.id,
      name: d.name,
      ownerId: owner?.id ?? null,
      ownerKind: owner ? owner.ownerKind : 'NEUTRAL',
      biome: d.biome,
      tags: d.tags,
      neighbors: d.neighbors,
      level: lvl,
      population: d.population,
      hiredWorkers: 0,
      happiness: d.happiness,
      loyalty: d.loyalty,
      stability: d.stability,
      defense: d.defense,
      castleId,
      buildingIds: [],
      depositIds: depositsByTerritory[d.id] ?? [],
      citySlots: world.citySlots[d.id] ?? [],
      tradeCooldown: 0,
      vocation: 'balanced',
      polygon: world.polygons[d.id] ?? [],
      center: world.centers[d.id] ?? fallback,
      area: world.areas[d.id] ?? 0,
      locked: d.locked ?? false,
      lockReason: d.lockReason,
    };
  }

  const playerKingdom = KINGDOM_DEFS.find((k) => k.ownerKind === 'PLAYER')!;

  const state: GameState = {
    version: STATE_VERSION,
    meta: { width: world.width, height: world.height, seed: WORLD.seed },
    time: { elapsed: 0, day: 1, speed: 1 },
    playerKingdomId: playerKingdom.id,
    kingdoms,
    territories,
    castles,
    deposits,
    buildings,
    armies,
    battles: {},
    training: [],
    tutorialStep: 0,
    tutorialDone: false,
    stats: emptyStats(),
    titleIndex: 0,
    chronicle: [],
    stage: 'kingdom',
    waves: 0,
    relations: {},
    pendingReveal: false,
    saga: {},
    sagaPending: null,
    stateName: null,
    governorId: null,
    generalId: null,
    civilPolicy: 'celeiros',
    warPolicy: 'fronteira',
    promotionPending: false,
  };

  seedStartingBuildings(state);
  return { state, world };
}

// ---------------------------------------------------------------------------
// Desenvolvimento inicial
// ---------------------------------------------------------------------------

let seedCounter = 0;

function addBuilding(
  state: GameState,
  territoryId: string,
  defId: BuildingKind,
  level: number,
  workers: number,
): Building | null {
  const t = state.territories[territoryId];
  const def = BUILDING_DEFS[defId];
  if (!t || !def) return null;

  let position = t.center;
  let depositId: string | null = null;

  if (def.deposit) {
    const dep = t.depositIds
      .map((id) => state.deposits[id])
      .find((d) => d && d.kind === def.deposit && !d.buildingId);
    if (!dep) return null;
    depositId = dep.id;
    position = dep.position;
  } else {
    const used = new Set(
      t.buildingIds
        .map((id) => state.buildings[id])
        .filter((b) => b && b.depositId === null)
        .map((b) => `${Math.round(b!.position.x)},${Math.round(b!.position.y)}`),
    );
    const slot = t.citySlots.find((s) => !used.has(`${Math.round(s.x)},${Math.round(s.y)}`));
    if (!slot) return null;
    position = slot;
  }

  const b: Building = {
    id: `bld_seed_${seedCounter++}`,
    defId,
    territoryId,
    depositId,
    position,
    level,
    targetLevel: level,
    workers: Math.min(workers, def.jobsPerLevel * level),
    construction: 0,
    efficiency: 1,
  };
  state.buildings[b.id] = b;
  t.buildingIds.push(b.id);
  if (depositId) state.deposits[depositId].buildingId = b.id;
  t.hiredWorkers += b.workers;
  return b;
}

function addGarrison(state: GameState, territoryId: string, units: Partial<Record<UnitKind, number>>) {
  const t = state.territories[territoryId];
  if (!t?.ownerId) return;
  const castle = t.castleId ? state.castles[t.castleId] : null;
  const anchor = castle?.position ?? t.center;
  const id = `army_seed_${territoryId}`;
  state.armies[id] = {
    id,
    name: `Guarnição de ${t.name}`,
    ownerId: t.ownerId,
    territoryId,
    units,
    morale: MILITARY.startingMorale,
    state: 'garrison',
    position: { x: anchor.x + 120, y: anchor.y + 54 },
    path: null,
    pathDistance: 0,
    pathLength: 0,
    targetTerritoryId: null,
    homeTerritoryId: territoryId,
    supplies: 0,
    battleId: null,
  };
}

/**
 * O jogador começa com o mínimo para entender o loop; a IA começa com
 * economia funcionando para que o mapa pareça um mundo habitado (§3/§8).
 */
function seedStartingBuildings(state: GameState) {
  for (const t of Object.values(state.territories)) {
    if (!t.ownerId) continue;
    const kingdom = state.kingdoms[t.ownerId];
    const isPlayer = kingdom.ownerKind === 'PLAYER';
    const isCapital = kingdom.capitalTerritoryId === t.id;

    if (isPlayer) {
      // Uma fazenda mantém o povo vivo; o resto o jogador constrói.
      addBuilding(state, t.id, 'farm', 1, 3);
      addBuilding(state, t.id, 'house', 1, 0);
      continue;
    }

    addBuilding(state, t.id, 'farm', isCapital ? 2 : 1, isCapital ? 5 : 3);
    addBuilding(state, t.id, 'lumberjack', isCapital ? 2 : 1, isCapital ? 5 : 3);
    addBuilding(state, t.id, 'house', isCapital ? 2 : 1, 0);
    if (isCapital) {
      addBuilding(state, t.id, 'sawmill', 1, 3);
      addBuilding(state, t.id, 'quarry', 1, 3);
      addBuilding(state, t.id, 'barracks', 1, 2);
      addGarrison(state, t.id, { militia: 12, spearman: 8, archer: 6 });
    } else {
      addGarrison(state, t.id, { militia: 8, spearman: 4 });
    }
  }
}
