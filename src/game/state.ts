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
} from './types';
import { buildWorld, type BuiltWorld, type TerritorySeedInput } from './world/WorldBuilder';

const TERRITORY_DEFS = territoriesRaw as TerritoryDef[];
const KINGDOM_DEFS = kingdomsRaw as KingdomDef[];

export const STATE_VERSION = 4;

export interface WorldBundle {
  state: GameState;
  world: BuiltWorld;
}

/** Constrói geometria + estado inicial a partir dos JSONs de dados. */
export function createWorld(): WorldBundle {
  const seeds: TerritorySeedInput[] = TERRITORY_DEFS.map((d) => ({
    id: d.id,
    seed: d.seed,
    weight: d.weight,
    biome: d.biome,
    ...{ neighbors: d.neighbors, features: d.features },
  }));

  const world = buildWorld(seeds);

  const kingdoms: Record<string, Kingdom> = {};
  for (const k of KINGDOM_DEFS) {
    kingdoms[k.id] = {
      id: k.id,
      name: k.name,
      ownerKind: k.ownerKind,
      color: k.color,
      colorDark: k.colorDark,
      emblem: k.emblem,
      capitalTerritoryId: k.capitalTerritoryId,
      aiProfile: k.aiProfile,
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

  for (const d of TERRITORY_DEFS) {
    const owner = d.owner ? kingdoms[d.owner] : null;
    const anchor = world.anchors[d.id] ?? d.seed;
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
      center: world.centers[d.id] ?? d.seed,
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
