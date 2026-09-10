import { QUALITY } from '../../config/balance';
import { PALETTE } from '../../config/palette';
import { BIOME_CODE, type BuiltWorld, type WorldGrid } from '../../world/WorldBuilder';
import { hexToRgb, mix, shade, type RGB } from '../color';

/**
 * TerrainLayer — pintura do terreno.
 *
 * O terreno é assado (baked) em bitmaps porque é a única parte do mundo que é
 * puro gradiente. Há dois níveis de detalhe (§39/§83):
 *  - "overview": um bitmap único de baixa resolução para zoom afastado;
 *  - "chunks":   pedaços 1:1 gerados sob demanda e mantidos em cache LRU.
 * Tudo que tem contorno (costa, rios, estradas, árvores) é vetor por cima.
 */

const CHUNK = 512;
const SAMPLE_DIV = 4; // 1 amostra a cada 4px de mundo
const OVERVIEW_SCALE = 0.25;

/**
 * Teto de chunks em memória. Cada um custa ~1 MB; no celular, estourar isso
 * derruba a aba, então o limite cai bastante em telas de toque.
 */
const MAX_CHUNKS = (() => {
  if (typeof window === 'undefined') return QUALITY.chunkCacheDesktop;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  if (coarse || memory <= 4) return QUALITY.chunkCacheMobile;
  return QUALITY.chunkCacheDesktop;
})();

const C = {
  oceanDeep: hexToRgb(PALETTE.oceanDeep),
  ocean: hexToRgb(PALETTE.ocean),
  oceanShallow: hexToRgb(PALETTE.oceanShallow),
  sand: hexToRgb(PALETTE.sand),
  plainsLow: hexToRgb(PALETTE.plainsLow),
  plainsHigh: hexToRgb(PALETTE.plainsHigh),
  fertile: hexToRgb(PALETTE.fertile),
  fertileDark: hexToRgb(PALETTE.fertileDark),
  forest: hexToRgb(PALETTE.forest),
  forestDark: hexToRgb(PALETTE.forestDark),
  hills: hexToRgb(PALETTE.hills),
  hillsDark: hexToRgb(PALETTE.hillsDark),
  rock: hexToRgb(PALETTE.rock),
  rockDark: hexToRgb(PALETTE.rockDark),
  snow: hexToRgb(PALETTE.snow),
  marsh: hexToRgb(PALETTE.marsh),
};

export class TerrainLayer {
  private grid: WorldGrid;
  /** Distância (em células) até a água — usada para profundidade e praia. */
  private coastDist: Float32Array;
  private chunks = new Map<string, HTMLCanvasElement>();
  private chunkOrder: string[] = [];
  private overview: HTMLCanvasElement | null = null;

  constructor(private world: BuiltWorld) {
    this.grid = world.grid;
    this.coastDist = computeCoastDistance(this.grid);
    this.overview = this.bakeOverview();
  }

  draw(ctx: CanvasRenderingContext2D, bounds: Bounds, zoom: number) {
    ctx.imageSmoothingEnabled = true;
    if (zoom < 0.5 && this.overview) {
      ctx.drawImage(this.overview, 0, 0, this.world.width, this.world.height);
      return;
    }
    const cx0 = Math.max(0, Math.floor(bounds.minX / CHUNK));
    const cy0 = Math.max(0, Math.floor(bounds.minY / CHUNK));
    const cx1 = Math.min(Math.ceil(this.world.width / CHUNK) - 1, Math.floor(bounds.maxX / CHUNK));
    const cy1 = Math.min(Math.ceil(this.world.height / CHUNK) - 1, Math.floor(bounds.maxY / CHUNK));

    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const canvas = this.getChunk(cx, cy);
        ctx.drawImage(canvas, cx * CHUNK, cy * CHUNK, CHUNK, CHUNK);
      }
    }
  }

  private getChunk(cx: number, cy: number): HTMLCanvasElement {
    const key = `${cx},${cy}`;
    const cached = this.chunks.get(key);
    if (cached) return cached;

    const size = CHUNK / SAMPLE_DIV;
    const src = document.createElement('canvas');
    src.width = size;
    src.height = size;
    const sctx = src.getContext('2d')!;
    const img = sctx.createImageData(size, size);
    this.fillSamples(img.data, size, size, cx * CHUNK, cy * CHUNK, SAMPLE_DIV);
    sctx.putImageData(img, 0, 0);

    const out = document.createElement('canvas');
    out.width = CHUNK;
    out.height = CHUNK;
    const octx = out.getContext('2d')!;
    octx.imageSmoothingEnabled = true;
    octx.drawImage(src, 0, 0, size, size, 0, 0, CHUNK, CHUNK);

    this.chunks.set(key, out);
    this.chunkOrder.push(key);
    while (this.chunkOrder.length > MAX_CHUNKS) {
      const old = this.chunkOrder.shift()!;
      this.chunks.delete(old);
    }
    return out;
  }

  private bakeOverview(): HTMLCanvasElement {
    const w = Math.ceil(this.world.width * OVERVIEW_SCALE);
    const h = Math.ceil(this.world.height * OVERVIEW_SCALE);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(w, h);
    this.fillSamples(img.data, w, h, 0, 0, 1 / OVERVIEW_SCALE);
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  /** Preenche um buffer RGBA amostrando o campo do mundo. */
  private fillSamples(
    data: Uint8ClampedArray,
    w: number,
    h: number,
    originX: number,
    originY: number,
    step: number,
  ) {
    const g = this.grid;
    for (let py = 0; py < h; py++) {
      const wy = originY + (py + 0.5) * step;
      const j = Math.min(g.h - 1, Math.max(0, Math.floor(wy / g.cell)));
      for (let px = 0; px < w; px++) {
        const wx = originX + (px + 0.5) * step;
        const i = Math.min(g.w - 1, Math.max(0, Math.floor(wx / g.cell)));
        const idx = j * g.w + i;
        const rgb = this.colorAt(idx, wx, wy);
        const o = (py * w + px) * 4;
        data[o] = rgb[0];
        data[o + 1] = rgb[1];
        data[o + 2] = rgb[2];
        data[o + 3] = 255;
      }
    }
  }

  private colorAt(idx: number, wx: number, wy: number): RGB {
    const g = this.grid;
    const code = g.biome[idx];
    const n = g.shade[idx];
    const dist = this.coastDist[idx];

    if (code === BIOME_CODE.ocean) {
      const depth = Math.min(1, Math.max(0, (-dist - 0.5) / 7));
      let c = mix(C.oceanShallow, C.ocean, Math.min(1, depth * 2));
      c = mix(c, C.oceanDeep, Math.max(0, depth - 0.5) * 2);
      return shade(c, (0.94 + n * 0.12) * (0.975 + microNoise(wx, wy) * 0.045));
    }

    let base: RGB;
    switch (code) {
      case BIOME_CODE.sand:
        base = mix(C.sand, C.plainsLow, Math.min(1, Math.max(0, dist - 0.6)) * 0.55);
        break;
      case BIOME_CODE.fertile:
        base = mix(C.fertileDark, C.fertile, n);
        break;
      case BIOME_CODE.forest:
        base = mix(C.forestDark, C.forest, n);
        break;
      case BIOME_CODE.hills:
        base = mix(C.hillsDark, C.hills, n);
        break;
      case BIOME_CODE.mountains:
        base = mix(C.rockDark, C.rock, n);
        break;
      case BIOME_CODE.snow:
        base = mix(C.rock, C.snow, 0.45 + n * 0.55);
        break;
      case BIOME_CODE.marsh:
        base = mix(C.marsh, C.plainsLow, n * 0.6);
        break;
      default:
        base = mix(C.plainsLow, C.plainsHigh, n);
    }

    // Luz vinda do noroeste, realçando o relevo sem sair do estilo cartoon.
    const w = g.w;
    const left = g.elev[Math.max(0, idx - 1)];
    const up = g.elev[Math.max(0, idx - w)];
    const here = g.elev[idx];
    const slope = (here - left) * 1.2 + (here - up) * 1.2;
    const light = 1 + Math.max(-0.22, Math.min(0.22, slope * 2.6));
    // Grão em duas escalas. A primeira quebra a aparência de gradiente liso;
    // a segunda cria manchas largas como pinceladas, sem formar um tile/grid.
    const grain = microNoise(wx, wy);
    const broad = microNoise(wx * 0.19 + 137, wy * 0.19 - 71);
    return shade(base, light * (0.965 + n * 0.055 + grain * 0.035 + broad * 0.025));
  }

  /** Invalida chunks (usado quando o mundo mudar visualmente no futuro). */
  invalidate() {
    this.chunks.clear();
    this.chunkOrder = [];
  }
}

/** Hash barato e determinístico; roda só quando um chunk é assado. */
function microNoise(x: number, y: number): number {
  const ix = Math.floor(x / 5);
  const iy = Math.floor(y / 5);
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 24) / 255 - 0.5;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Distância assinada até a costa, em células: positiva em terra, negativa em
 * água. Chanfro de dois passes — rápido o bastante para rodar no carregamento.
 */
function computeCoastDistance(g: WorldGrid): Float32Array {
  const n = g.w * g.h;
  const land = new Float32Array(n).fill(1e6);
  const water = new Float32Array(n).fill(1e6);
  for (let i = 0; i < n; i++) {
    if (g.land[i]) water[i] = 0;
    else land[i] = 0;
  }
  chamfer(land, g.w, g.h);
  chamfer(water, g.w, g.h);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = g.land[i] ? land[i] : -water[i];
  return out;
}

function chamfer(d: Float32Array, w: number, h: number) {
  const D1 = 1;
  const D2 = 1.41;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      let v = d[k];
      if (i > 0) v = Math.min(v, d[k - 1] + D1);
      if (j > 0) v = Math.min(v, d[k - w] + D1);
      if (i > 0 && j > 0) v = Math.min(v, d[k - w - 1] + D2);
      if (i < w - 1 && j > 0) v = Math.min(v, d[k - w + 1] + D2);
      d[k] = v;
    }
  }
  for (let j = h - 1; j >= 0; j--) {
    for (let i = w - 1; i >= 0; i--) {
      const k = j * w + i;
      let v = d[k];
      if (i < w - 1) v = Math.min(v, d[k + 1] + D1);
      if (j < h - 1) v = Math.min(v, d[k + w] + D1);
      if (i < w - 1 && j < h - 1) v = Math.min(v, d[k + w + 1] + D2);
      if (i > 0 && j < h - 1) v = Math.min(v, d[k + w - 1] + D2);
      d[k] = v;
    }
  }
}
