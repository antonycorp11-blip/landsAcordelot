import { WORLD } from '../config/balance';
import type { Biome, Vec2 } from '../types';
import { fbm, fbmSigned } from './noise';
import {
  boundsOf,
  chaikin,
  polygonArea,
  polygonCentroid,
  pointInPolygon,
  resample,
  simplify,
  traceMaskContours,
} from './geometry';
import { hashString, makeRng, range } from './rng';

/**
 * WorldBuilder — transforma os dados de `territories.json` em um mundo 2D orgânico.
 *
 * Nada aqui é desenhado à mão: fronteiras, costa, rios, estradas e vegetação
 * são derivados de um campo de ruído determinístico. Isso permite crescer o mapa
 * (mais territórios no JSON) sem reescrever geometria (§80/§82).
 */

export const BIOME_CODE = {
  ocean: 0,
  sand: 1,
  plains: 2,
  fertile: 3,
  forest: 4,
  hills: 5,
  mountains: 6,
  marsh: 7,
  snow: 8,
} as const;

export type BiomeCode = (typeof BIOME_CODE)[keyof typeof BIOME_CODE];

const BIOME_OF_NAME: Record<Biome, BiomeCode> = {
  plains: BIOME_CODE.plains,
  fertile: BIOME_CODE.fertile,
  forest: BIOME_CODE.forest,
  hills: BIOME_CODE.hills,
  mountains: BIOME_CODE.mountains,
  coast: BIOME_CODE.plains,
  marsh: BIOME_CODE.marsh,
};

export interface TerritorySeedInput {
  id: string;
  seed: Vec2;
  weight: number;
  biome: Biome;
}

export interface PropInstance {
  kind: 'tree_round' | 'tree_pine' | 'rock' | 'peak' | 'house' | 'windmill' | 'shrine' | 'dock';
  x: number;
  y: number;
  s: number;
  /** Fase para animações (fumaça, moinho). */
  phase: number;
  territory: number;
}

export interface RoadPath {
  a: string;
  b: string;
  points: Vec2[];
  bridges: Vec2[];
}

export interface WorldGrid {
  w: number;
  h: number;
  cell: number;
  land: Uint8Array;
  elev: Float32Array;
  biome: Uint8Array;
  terr: Int16Array;
  shade: Float32Array;
}

export interface BuiltWorld {
  width: number;
  height: number;
  grid: WorldGrid;
  order: string[];
  polygons: Record<string, Vec2[]>;
  centers: Record<string, Vec2>;
  areas: Record<string, number>;
  /** Ponto interno bom para posicionar o castelo/rótulo. */
  anchors: Record<string, Vec2>;
  coastlines: Vec2[][];
  rivers: Vec2[][];
  roads: RoadPath[];
  props: PropInstance[];
  /** Índice espacial simples para culling de props (§40). */
  propBuckets: Map<number, PropInstance[]>;
  bucketSize: number;
  /** Depósitos de recurso: os "spots" onde se instalam extratores. */
  deposits: DepositSeed[];
  /** Vagas urbanas por território (oficinas ao redor do castelo). */
  citySlots: Record<string, Vec2[]>;
}

export interface DepositSeed {
  territoryId: string;
  kind: 'forest' | 'stone' | 'ore' | 'gold' | 'farmland';
  position: Vec2;
  richness: number;
}

const SEA_ANCHORS = [
  { x: 2500, y: 3320, r: 1500, amp: 1.35 },
  { x: 5750, y: 2000, r: 1500, amp: 1.3 },
  { x: -420, y: 2700, r: 1200, amp: 1.1 },
  { x: 4500, y: 3050, r: 950, amp: 1.0 },
];

/** Terras "além do mapa jogável" — dão a sensação de mundo maior (§4). */
const WILDERNESS_ANCHORS = [
  { x: 2500, y: -320, r: 2000, amp: 1.0 },
  { x: 620, y: 180, r: 950, amp: 0.75 },
  { x: 4750, y: 260, r: 950, amp: 0.75 },
  { x: 5000, y: 1350, r: 700, amp: 0.55 },
  { x: 220, y: 1500, r: 850, amp: 0.6 },
];

/** Cordilheira contínua no norte. */
const RIDGE: Vec2[] = [
  { x: 500, y: 430 },
  { x: 1400, y: 300 },
  { x: 2350, y: 340 },
  { x: 3250, y: 260 },
  { x: 4300, y: 420 },
];

function distToPolyline(p: Vec2, line: Vec2[]): number {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy || 1;
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
    if (d < best) best = d;
  }
  return best;
}

export function buildWorld(seeds: TerritorySeedInput[]): BuiltWorld {
  const W = WORLD.width;
  const H = WORLD.height;
  const cell = WORLD.cell;
  const w = Math.ceil(W / cell);
  const h = Math.ceil(H / cell);
  const seed = WORLD.seed;

  const land = new Uint8Array(w * h);
  const elev = new Float32Array(w * h);
  const biome = new Uint8Array(w * h);
  const terr = new Int16Array(w * h).fill(-1);
  const shade = new Float32Array(w * h);

  const maxRadius = 900;

  // ---- Campo de terra/água + elevação + posse de território ---------------
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const x = (i + 0.5) * cell;
      const y = (j + 0.5) * cell;
      const idx = j * w + i;

      let value = -0.34;
      value += 0.5 * Math.exp(-(((x - W * 0.48) / 2900) ** 2 + ((y - H * 0.45) / 1750) ** 2));

      for (const s of seeds) {
        const r = 560 * s.weight;
        value += 1.25 * Math.exp(-(((x - s.seed.x) / r) ** 2 + ((y - s.seed.y) / r) ** 2));
      }
      for (const a of WILDERNESS_ANCHORS) {
        value += a.amp * Math.exp(-(((x - a.x) / a.r) ** 2 + ((y - a.y) / a.r) ** 2));
      }
      for (const a of SEA_ANCHORS) {
        value -= a.amp * Math.exp(-(((x - a.x) / a.r) ** 2 + ((y - a.y) / a.r) ** 2));
      }

      const edge = Math.min(x, y, W - x, H - y);
      value -= Math.max(0, 1 - edge / 420) * 1.15;
      value += fbmSigned(x / 620, y / 620, 4, seed) * 0.42;
      value += fbmSigned(x / 180, y / 180, 3, seed + 7) * 0.11;

      const isLand = value > 0 ? 1 : 0;
      land[idx] = isLand;

      // Elevação
      const ridgeD = distToPolyline({ x, y }, RIDGE);
      let e = 0.12 + fbm(x / 900, y / 900, 4, seed + 31) * 0.5;
      e += 0.62 * Math.exp(-((ridgeD / 340) ** 2));
      e += 0.28 * Math.exp(-((ridgeD / 720) ** 2));
      e += Math.max(0, value) * 0.08;

      // Posse de território por distância deformada (fronteiras orgânicas §50).
      let bestD = Infinity;
      let best = -1;
      const warp = 1 + fbmSigned(x / 430, y / 430, 3, seed + 91) * 0.42;
      for (let k = 0; k < seeds.length; k++) {
        const s = seeds[k];
        const d = (Math.hypot(x - s.seed.x, y - s.seed.y) / s.weight) * warp;
        if (d < bestD) {
          bestD = d;
          best = k;
        }
      }
      const owned = isLand === 1 && bestD < maxRadius;
      terr[idx] = owned ? best : -1;

      if (owned) {
        const b = seeds[best].biome;
        if (b === 'mountains') e += 0.34;
        else if (b === 'hills') e += 0.18;
      }
      e = Math.max(0, Math.min(1, e));
      elev[idx] = e;
      shade[idx] = fbm(x / 95, y / 95, 3, seed + 13);

      // Bioma final
      let code: number;
      if (!isLand) {
        code = BIOME_CODE.ocean;
      } else if (e > 0.9) {
        code = BIOME_CODE.snow;
      } else if (e > 0.76) {
        code = BIOME_CODE.mountains;
      } else if (owned) {
        code = BIOME_OF_NAME[seeds[best].biome];
        if (code === BIOME_CODE.mountains && e < 0.6) code = BIOME_CODE.hills;
        // Manchas internas: nenhum território é um bloco de cor única.
        if (code === BIOME_CODE.plains || code === BIOME_CODE.fertile) {
          const m = fbm(x / 290, y / 290, 3, seed + 55);
          if (m > 0.615) code = BIOME_CODE.forest;
          else if (m < 0.37 && e > 0.5) code = BIOME_CODE.hills;
        } else if (code === BIOME_CODE.forest) {
          const m = fbm(x / 260, y / 260, 3, seed + 77);
          if (m < 0.38) code = BIOME_CODE.plains;
        }
      } else if (e > 0.6) {
        code = BIOME_CODE.hills;
      } else if (fbm(x / 380, y / 380, 3, seed + 55) > 0.56) {
        code = BIOME_CODE.forest;
      } else {
        code = BIOME_CODE.plains;
      }
      biome[idx] = code;
    }
  }

  // Faixa de areia junto ao mar
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const idx = j * w + i;
      if (!land[idx] || biome[idx] === BIOME_CODE.mountains || biome[idx] === BIOME_CODE.snow) {
        continue;
      }
      let nearWater = false;
      for (let dy = -1; dy <= 1 && !nearWater; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const ni = i + dx;
          const nj = j + dy;
          if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
          if (!land[nj * w + ni]) {
            nearWater = true;
            break;
          }
        }
      }
      if (nearWater) biome[idx] = BIOME_CODE.sand;
    }
  }

  const grid: WorldGrid = { w, h, cell, land, elev, biome, terr, shade };

  // ---- Polígonos de território -------------------------------------------
  const order = seeds.map((s) => s.id);
  const polygons: Record<string, Vec2[]> = {};
  const centers: Record<string, Vec2> = {};
  const areas: Record<string, number> = {};
  const anchors: Record<string, Vec2> = {};

  for (let k = 0; k < seeds.length; k++) {
    const loops = traceMaskContours(
      (i, j) => i >= 0 && j >= 0 && i < w && j < h && terr[j * w + i] === k,
      w,
      h,
    );
    const raw = loops[0] ?? [];
    const world = raw.map((p) => ({ x: p.x * cell, y: p.y * cell }));
    const poly = chaikin(simplify(world, cell * 0.42), 3);
    polygons[seeds[k].id] = poly;
    areas[seeds[k].id] = polygonArea(poly);
    const c = polygonCentroid(poly);
    centers[seeds[k].id] = c;
    anchors[seeds[k].id] = pointInPolygon(c, poly) ? c : (poly[0] ?? seeds[k].seed);
  }

  // ---- Linha de costa (para espuma vetorial) -----------------------------
  const coastLoops = traceMaskContours(
    (i, j) => i >= 0 && j >= 0 && i < w && j < h && land[j * w + i] === 1,
    w,
    h,
  ).slice(0, 6);
  const coastlines = coastLoops.map((loop) =>
    chaikin(simplify(loop.map((p) => ({ x: p.x * cell, y: p.y * cell })), cell * 1.1), 2),
  );

  // ---- Rios ---------------------------------------------------------------
  const rivers = buildRivers(grid);

  // ---- Estradas -----------------------------------------------------------
  const roads = buildRoads(seeds, anchors, grid, rivers);

  // ---- Props decorativos --------------------------------------------------
  const props = buildProps(seeds, polygons, grid, roads);

  // ---- Depósitos e vagas urbanas -----------------------------------------
  const deposits = buildDeposits(seeds, polygons, grid);
  const citySlots: Record<string, Vec2[]> = {};
  for (let k = 0; k < seeds.length; k++) {
    const id = seeds[k].id;
    citySlots[id] = buildCitySlots(id, anchors[id], polygons[id], grid, deposits);
  }

  const bucketSize = 512;
  const propBuckets = new Map<number, PropInstance[]>();
  const bucketKey = (x: number, y: number) =>
    Math.floor(x / bucketSize) * 100000 + Math.floor(y / bucketSize);
  for (const p of props) {
    const key = bucketKey(p.x, p.y);
    let arr = propBuckets.get(key);
    if (!arr) propBuckets.set(key, (arr = []));
    arr.push(p);
  }
  for (const arr of propBuckets.values()) arr.sort((a, b) => a.y - b.y);

  return {
    width: W,
    height: H,
    grid,
    order,
    polygons,
    centers,
    areas,
    anchors,
    coastlines,
    rivers,
    roads,
    props,
    propBuckets,
    bucketSize,
    deposits,
    citySlots,
  };
}

// ---------------------------------------------------------------------------
// Depósitos e vagas urbanas
// ---------------------------------------------------------------------------

const FEATURE_TO_DEPOSIT: Record<string, DepositSeed['kind']> = {
  forest: 'forest',
  quarry: 'stone',
  iron_mine: 'ore',
  gold_mine: 'gold',
  farmland: 'farmland',
};

function buildDeposits(
  seeds: TerritorySeedInput[],
  polygons: Record<string, Vec2[]>,
  grid: WorldGrid,
): DepositSeed[] {
  const out: DepositSeed[] = [];

  for (let k = 0; k < seeds.length; k++) {
    const s = seeds[k];
    const poly = polygons[s.id];
    if (!poly || poly.length < 3) continue;
    const bb = boundsOf(poly);
    const rng = makeRng(hashString('dep_' + s.id));
    const feats = (s as TerritorySeedInput & { features?: string[] }).features ?? [];

    const placed: Vec2[] = [];
    const place = (kind: DepositSeed['kind'], filter: (c: number, e: number) => boolean) => {
      for (let attempt = 0; attempt < 400; attempt++) {
        const x = range(rng, bb.minX, bb.maxX);
        const y = range(rng, bb.minY, bb.maxY);
        const idx = sampleCell(grid, x, y);
        if (idx < 0 || !grid.land[idx] || grid.terr[idx] !== k) continue;
        if (!filter(grid.biome[idx], grid.elev[idx])) continue;
        if (!pointInPolygon({ x, y }, poly)) continue;
        // Depósitos não se amontoam.
        if (placed.some((p) => Math.hypot(p.x - x, p.y - y) < 150)) continue;
        placed.push({ x, y });
        out.push({
          territoryId: s.id,
          kind,
          position: { x, y },
          richness: Math.round(range(rng, 0.75, 1.35) * 100) / 100,
        });
        return true;
      }
      return false;
    };

    const isForest = (c: number) => c === BIOME_CODE.forest;
    const isRocky = (c: number, e: number) => c === BIOME_CODE.hills || c === BIOME_CODE.mountains || e > 0.6;
    const isOpen = (c: number) =>
      c === BIOME_CODE.plains || c === BIOME_CODE.fertile || c === BIOME_CODE.marsh;

    // Depósitos declarados no JSON do território.
    for (const f of feats) {
      const kind = FEATURE_TO_DEPOSIT[f];
      if (!kind) continue;
      if (kind === 'forest') place('forest', isForest) || place('forest', () => true);
      else if (kind === 'stone' || kind === 'ore' || kind === 'gold') {
        place(kind, isRocky) || place(kind, () => true);
      } else place('farmland', isOpen) || place('farmland', () => true);
    }

    // Garantia mínima: todo território sustenta a cadeia produtiva inteira.
    const countOf = (kind: DepositSeed['kind']) =>
      out.filter((d) => d.territoryId === s.id && d.kind === kind).length;
    const ensure = (
      kind: DepositSeed['kind'],
      quantity: number,
      filter: (c: number, e: number) => boolean,
    ) => {
      while (countOf(kind) < quantity) {
        if (!place(kind, filter) && !place(kind, () => true)) break;
      }
    };

    ensure('forest', 2, isForest);
    ensure('farmland', 2, isOpen);
    ensure('stone', 1, isRocky);
    ensure('ore', 1, isRocky);

    // Todo território tem ao menos um veio de ouro, para a cadeia até a Casa
    // da Moeda ser aprendível em casa. O que muda é a riqueza: planície dá um
    // filete, montanha dá o veio que faz uma região valer uma guerra (§26).
    const rocky = s.biome === 'hills' || s.biome === 'mountains';
    ensure('gold', 1, rocky ? isRocky : () => true);
    for (const d of out) {
      if (d.territoryId !== s.id || d.kind !== 'gold') continue;
      d.richness = rocky
        ? Math.round(range(rng, 1.0, 1.45) * 100) / 100
        : Math.round(range(rng, 0.4, 0.62) * 100) / 100;
    }
  }

  return out;
}

/**
 * Vagas urbanas: onde as oficinas podem nascer.
 *
 * Antes eram anéis colados no castelo e a cidade virava um amontoado. Agora
 * varremos o território inteiro numa grade com sacudida, respeitando:
 *  - a caixa de exclusão do castelo (o sprite se estende muito para cima);
 *  - distância mínima entre oficinas;
 *  - distância dos depósitos, que já têm dono.
 * A ordem é do castelo para fora, então a cidade cresce de dentro para a borda.
 */
const CASTLE_KEEPOUT = { halfWidth: 230, top: 360, bottom: 110 };
const MAX_SLOTS = 26;
/** Abaixo disto o território fica injogável: relaxamos as regras e tentamos de novo. */
const MIN_SLOTS = 8;

interface SlotPass {
  gap: number;
  gapDeposit: number;
  keepout: number;
  allowMountains: boolean;
  /** Último recurso: aceita até pico nevado, senão a região fica injogável. */
  allowSnow?: boolean;
}

/**
 * Passes de tolerância decrescente. O primeiro é o ideal: longe do castelo,
 * bem espaçado, fora da rocha. Território de montanha não atendia nenhuma
 * dessas condições e ficava com ZERO vagas — sem quartel, sem oficina, sem
 * jogo. Então afrouxamos por etapas até dar para construir.
 */
const SLOT_PASSES: SlotPass[] = [
  { gap: 146, gapDeposit: 128, keepout: 1, allowMountains: false },
  { gap: 124, gapDeposit: 110, keepout: 0.8, allowMountains: true },
  { gap: 100, gapDeposit: 92, keepout: 0.6, allowMountains: true },
  { gap: 92, gapDeposit: 80, keepout: 0.45, allowMountains: true, allowSnow: true },
];

function buildCitySlots(
  id: string,
  anchor: Vec2 | undefined,
  poly: Vec2[] | undefined,
  grid: WorldGrid,
  deposits: DepositSeed[],
): Vec2[] {
  if (!anchor || !poly || poly.length < 3) return [];
  const bb = boundsOf(poly);
  const mine = deposits.filter((d) => d.territoryId === id);

  let best: Vec2[] = [];
  for (const pass of SLOT_PASSES) {
    const found = sampleSlots(id, anchor, poly, bb, grid, mine, pass);
    if (found.length > best.length) best = found;
    if (best.length >= MIN_SLOTS) break;
  }
  return best;
}

function sampleSlots(
  id: string,
  anchor: Vec2,
  poly: Vec2[],
  bb: { minX: number; minY: number; maxX: number; maxY: number },
  grid: WorldGrid,
  deposits: DepositSeed[],
  pass: SlotPass,
): Vec2[] {
  const rng = makeRng(hashString('slots_' + id + pass.gap));
  const step = 74;

  const candidates: Vec2[] = [];
  for (let y = bb.minY; y <= bb.maxY; y += step) {
    for (let x = bb.minX; x <= bb.maxX; x += step) {
      candidates.push({ x: x + range(rng, -26, 26), y: y + range(rng, -26, 26) });
    }
  }
  candidates.sort(
    (a, b) =>
      Math.hypot(a.x - anchor.x, a.y - anchor.y) - Math.hypot(b.x - anchor.x, b.y - anchor.y),
  );

  const slots: Vec2[] = [];
  for (const p of candidates) {
    if (slots.length >= MAX_SLOTS) break;

    const dx = p.x - anchor.x;
    const dy = p.y - anchor.y;
    if (
      Math.abs(dx) < CASTLE_KEEPOUT.halfWidth * pass.keepout &&
      dy < CASTLE_KEEPOUT.bottom * pass.keepout &&
      dy > -CASTLE_KEEPOUT.top * pass.keepout
    ) {
      continue;
    }

    const idx = sampleCell(grid, p.x, p.y);
    if (idx < 0 || !grid.land[idx]) continue;
    const biome = grid.biome[idx];
    if (biome === BIOME_CODE.snow && !pass.allowSnow) continue;
    if (biome === BIOME_CODE.mountains && !pass.allowMountains) continue;
    if (!pointInPolygon(p, poly)) continue;
    if (deposits.some((d) => Math.hypot(d.position.x - p.x, d.position.y - p.y) < pass.gapDeposit)) {
      continue;
    }
    if (slots.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < pass.gap)) continue;

    slots.push(p);
  }
  return slots;
}

// ---------------------------------------------------------------------------
// Rios
// ---------------------------------------------------------------------------

function sampleLand(grid: WorldGrid, x: number, y: number): boolean {
  const i = Math.floor(x / grid.cell);
  const j = Math.floor(y / grid.cell);
  if (i < 0 || j < 0 || i >= grid.w || j >= grid.h) return false;
  return grid.land[j * grid.w + i] === 1;
}

export function sampleCell(grid: WorldGrid, x: number, y: number): number {
  const i = Math.floor(x / grid.cell);
  const j = Math.floor(y / grid.cell);
  if (i < 0 || j < 0 || i >= grid.w || j >= grid.h) return -1;
  return j * grid.w + i;
}

/** Nascentes na cordilheira, correndo até o mar. Rios dividem territórios (§91). */
const RIVER_SOURCES: { from: Vec2; to: Vec2 }[] = [
  { from: { x: 2260, y: 520 }, to: { x: 2480, y: 2680 } },
  { from: { x: 3320, y: 470 }, to: { x: 3040, y: 2320 } },
  { from: { x: 1180, y: 560 }, to: { x: 1500, y: 2500 } },
];

function buildRivers(grid: WorldGrid): Vec2[][] {
  const out: Vec2[][] = [];
  for (let r = 0; r < RIVER_SOURCES.length; r++) {
    const { from, to } = RIVER_SOURCES[r];
    const pts: Vec2[] = [];
    let p = { ...from };
    for (let step = 0; step < 260; step++) {
      pts.push({ ...p });
      const dx = to.x - p.x;
      const dy = to.y - p.y;
      const len = Math.hypot(dx, dy);
      if (len < 40) break;
      const nx = dx / len;
      const ny = dy / len;
      const wob = fbmSigned(p.x / 260, p.y / 260, 3, WORLD.seed + 300 + r * 17) * 0.9;
      const px = -ny;
      const py = nx;
      p = { x: p.x + nx * 26 + px * wob * 22, y: p.y + ny * 26 + py * wob * 22 };
      if (!sampleLand(grid, p.x, p.y)) {
        pts.push({ ...p });
        break;
      }
    }
    out.push(pts);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Estradas
// ---------------------------------------------------------------------------

function segmentsCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2): Vec2 | null {
  const r = { x: b.x - a.x, y: b.y - a.y };
  const s = { x: d.x - c.x, y: d.y - c.y };
  const denom = r.x * s.y - r.y * s.x;
  if (Math.abs(denom) < 1e-8) return null;
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / denom;
  const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: a.x + r.x * t, y: a.y + r.y * t };
}

function buildRoads(
  seeds: TerritorySeedInput[],
  anchors: Record<string, Vec2>,
  grid: WorldGrid,
  rivers: Vec2[][],
): RoadPath[] {
  const roads: RoadPath[] = [];
  const done = new Set<string>();
  const byId = new Map(seeds.map((s) => [s.id, s]));

  for (const s of seeds) {
    const neighbors = (s as TerritorySeedInput & { neighbors?: string[] }).neighbors ?? [];
    for (const nId of neighbors) {
      const key = [s.id, nId].sort().join('|');
      if (done.has(key) || !byId.has(nId)) continue;
      done.add(key);

      const a = anchors[s.id];
      const b = anchors[nId];
      if (!a || !b) continue;

      const rng = makeRng(hashString(key));
      const raw: Vec2[] = [a];
      const steps = 5;
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const mx = a.x + (b.x - a.x) * t;
        const my = a.y + (b.y - a.y) * t;
        const nx = -(b.y - a.y);
        const ny = b.x - a.x;
        const nl = Math.hypot(nx, ny) || 1;
        const off = range(rng, -1, 1) * 90 * Math.sin(Math.PI * t);
        let p = { x: mx + (nx / nl) * off, y: my + (ny / nl) * off };
        if (!sampleLand(grid, p.x, p.y)) p = { x: mx, y: my };
        raw.push(p);
      }
      raw.push(b);

      const points = smoothPath(raw);
      const bridges: Vec2[] = [];
      for (let i = 1; i < points.length; i++) {
        for (const river of rivers) {
          for (let k = 1; k < river.length; k++) {
            const hit = segmentsCross(points[i - 1], points[i], river[k - 1], river[k]);
            if (hit) bridges.push(hit);
          }
        }
      }
      roads.push({ a: s.id, b: nId, points, bridges });
    }
  }
  return roads;
}

/** Catmull-Rom simples para deixar as estradas curvas. */
function smoothPath(points: Vec2[]): Vec2[] {
  if (points.length < 3) return points;
  const out: Vec2[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    for (let t = 0; t < 1; t += 0.14) {
      const t2 = t * t;
      const t3 = t2 * t;
      out.push({
        x:
          0.5 *
          (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
            (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y:
          0.5 *
          (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
            (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

function buildProps(
  seeds: TerritorySeedInput[],
  polygons: Record<string, Vec2[]>,
  grid: WorldGrid,
  roads: RoadPath[],
): PropInstance[] {
  const props: PropInstance[] = [];
  const roadPoints: Vec2[] = [];
  for (const r of roads) for (const p of resample(r.points, 60)) roadPoints.push(p);

  const nearRoad = (x: number, y: number, d: number) => {
    for (const p of roadPoints) {
      if (Math.abs(p.x - x) < d && Math.abs(p.y - y) < d) return true;
    }
    return false;
  };

  // Vegetação e relevo por todo o mundo, inclusive fora dos territórios.
  const rng = makeRng(WORLD.seed + 4242);
  const step = 46;
  for (let y = 40; y < WORLD.height - 20; y += step) {
    for (let x = 40; x < WORLD.width - 20; x += step) {
      const jx = x + range(rng, -20, 20);
      const jy = y + range(rng, -20, 20);
      const idx = sampleCell(grid, jx, jy);
      if (idx < 0 || !grid.land[idx]) continue;
      const code = grid.biome[idx];
      const e = grid.elev[idx];
      const t = grid.terr[idx];
      const roll = rng();

      if (code === BIOME_CODE.snow || code === BIOME_CODE.mountains) {
        if (roll < (e > 0.85 ? 0.75 : 0.42)) {
          props.push({
            kind: 'peak',
            x: jx,
            y: jy,
            s: range(rng, 0.85, 1.5) * (e > 0.86 ? 1.25 : 1),
            phase: rng(),
            territory: t,
          });
        }
        continue;
      }
      if (code === BIOME_CODE.sand) continue;
      if (nearRoad(jx, jy, 42)) continue;

      const forestChance =
        code === BIOME_CODE.forest
          ? 0.82
          : code === BIOME_CODE.marsh
            ? 0.4
            : code === BIOME_CODE.hills
              ? 0.18
              : 0.2;
      if (roll < forestChance) {
        const pine = code === BIOME_CODE.forest ? rng() < 0.6 : rng() < 0.3;
        props.push({
          kind: pine ? 'tree_pine' : 'tree_round',
          x: jx,
          y: jy,
          s: range(rng, 0.8, 1.25),
          phase: rng(),
          territory: t,
        });
      } else if (code === BIOME_CODE.hills && roll < forestChance + 0.22) {
        props.push({ kind: 'rock', x: jx, y: jy, s: range(rng, 0.7, 1.2), phase: rng(), territory: t });
      }
    }
  }

  // Decoração ligada ao território (casario disperso, moinhos, santuários, docas).
  for (let k = 0; k < seeds.length; k++) {
    const s = seeds[k];
    const poly = polygons[s.id];
    if (!poly || poly.length < 3) continue;
    const bb = boundsOf(poly);
    const trng = makeRng(hashString('prop_' + s.id));
    const feats = (s as TerritorySeedInput & { features?: string[] }).features ?? [];

    const place = (kind: PropInstance['kind'], count: number, filter?: (c: number) => boolean) => {
      let placed = 0;
      let guard = 0;
      while (placed < count && guard++ < count * 220) {
        const x = range(trng, bb.minX, bb.maxX);
        const y = range(trng, bb.minY, bb.maxY);
        const idx = sampleCell(grid, x, y);
        if (idx < 0 || !grid.land[idx] || grid.terr[idx] !== k) continue;
        if (filter && !filter(grid.biome[idx])) continue;
        if (!pointInPolygon({ x, y }, poly)) continue;
        props.push({ kind, x, y, s: range(trng, 0.9, 1.15), phase: trng(), territory: k });
        placed++;
      }
    };

    const soft = (c: number) =>
      c !== BIOME_CODE.mountains && c !== BIOME_CODE.snow && c !== BIOME_CODE.sand;

    if (feats.includes('harbor')) place('dock', 1, (c) => c === BIOME_CODE.sand);
    if (feats.includes('shrine')) place('shrine', 1, soft);
    place('house', 5, soft);
    place('windmill', 1, soft);
  }

  props.sort((a, b) => a.y - b.y);
  return props;
}
