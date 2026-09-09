import { CAMERA } from '../../config/balance';
import { PALETTE } from '../../config/palette';
import type { Vec2 } from '../../types';
import { resample } from '../../world/geometry';
import { hashString, makeRng, range } from '../../world/rng';
import type { BuiltWorld, PropInstance } from '../../world/WorldBuilder';
import { assets } from '../AssetManager';
import type { Bounds } from './TerrainLayer';
import {
  drawDock,
  drawHouse,
  drawPeak,
  drawRock,
  drawShrine,
  drawTreePine,
  drawTreeRound,
  drawWindmill,
} from '../sprites/props';

/** Carroças que circulam pelas estradas — sinal de economia viva (§8). */
const CARGO = [
  'terrain/wagon_covered',
  'terrain/wagon_logs',
  'terrain/wagon_stone',
  'terrain/wagon_food',
  'terrain/pack_horse',
];

interface Traveler {
  path: Vec2[];
  t: number;
  speed: number;
  dir: 1 | -1;
  kind: 'cart' | 'walker';
  /** Sprite da carroça — varia a carga que circula pelas estradas. */
  cargo: string;
}

/**
 * PropLayer — vegetação, relevo, produção e povo.
 *
 * Culling por buckets espaciais e LOD por zoom (§39/§40): longe some o detalhe
 * fino, perto aparecem pessoas e carroças percorrendo as estradas.
 */
export class PropLayer {
  private travelers: Traveler[] = [];

  constructor(private world: BuiltWorld) {
    for (const road of world.roads) {
      const rng = makeRng(hashString(road.a + road.b));
      const path = resample(road.points, 14);
      const count = 1 + Math.floor(rng() * 2);
      for (let i = 0; i < count; i++) {
        this.travelers.push({
          path,
          t: rng(),
          speed: range(rng, 0.012, 0.026),
          dir: rng() < 0.5 ? 1 : -1,
          kind: rng() < 0.5 ? 'cart' : 'walker',
          cargo: CARGO[Math.floor(rng() * CARGO.length) % CARGO.length],
        });
      }
    }
  }

  update(dt: number) {
    for (const tr of this.travelers) {
      tr.t += tr.speed * dt * tr.dir;
      if (tr.t > 1) {
        tr.t = 1;
        tr.dir = -1;
      } else if (tr.t < 0) {
        tr.t = 0;
        tr.dir = 1;
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, bounds: Bounds, zoom: number, time: number) {
    const size = this.world.bucketSize;
    const bx0 = Math.floor(bounds.minX / size);
    const bx1 = Math.floor(bounds.maxX / size);
    const by0 = Math.floor(bounds.minY / size);
    const by1 = Math.floor(bounds.maxY / size);

    const showSmall = zoom >= CAMERA.lodProps;
    const visible: PropInstance[] = [];
    for (let bx = bx0; bx <= bx1; bx++) {
      for (let by = by0; by <= by1; by++) {
        const arr = this.world.propBuckets.get(bx * 100000 + by);
        if (!arr) continue;
        for (const p of arr) {
          if (p.x < bounds.minX || p.x > bounds.maxX || p.y < bounds.minY || p.y > bounds.maxY) continue;
          if (!showSmall && p.kind !== 'peak') continue;
          visible.push(p);
        }
      }
    }
    visible.sort((a, b) => a.y - b.y);

    for (const p of visible) {
      switch (p.kind) {
        case 'tree_round': {
          // Alterna árvore isolada e moita para o bosque não virar carimbo.
          const grove = p.phase > 0.72;
          const key = grove ? 'terrain/grove_small' : 'nature/tree_oak';
          const sc = (grove ? 0.16 : 0.13) * p.s;
          if (!assets.draw(ctx, key, p.x, p.y, sc, { flip: p.phase > 0.5 })) {
            drawTreeRound(ctx, p.x, p.y, p.s);
          }
          break;
        }
        case 'tree_pine': {
          const grove = p.phase > 0.68;
          const key = grove ? 'terrain/grove_small' : 'terrain/tree_lone';
          const sc = (grove ? 0.17 : 0.14) * p.s;
          if (!assets.draw(ctx, key, p.x, p.y, sc, { flip: p.phase < 0.34 })) {
            drawTreePine(ctx, p.x, p.y, p.s);
          }
          break;
        }
        case 'rock':
          if (!assets.draw(ctx, 'terrain/boulders', p.x, p.y, 0.16 * p.s, { flip: p.phase > 0.5 })) {
            drawRock(ctx, p.x, p.y, p.s);
          }
          break;
        case 'peak': {
          const snowy = p.s > 1.25;
          const key = snowy ? 'terrain/mountain_snow' : 'terrain/mountain_rock';
          if (!assets.draw(ctx, key, p.x, p.y, 0.34 * p.s, { flip: p.phase > 0.55 })) {
            drawPeak(ctx, p.x, p.y, p.s);
          }
          break;
        }
        case 'house':
          drawHouse(ctx, p.x, p.y, p.s);
          if (showSmall) drawSmoke(ctx, p.x + 5 * p.s, p.y - 24 * p.s, time + p.phase * 6, p.s * 0.8);
          break;
        case 'shrine':
          drawShrine(ctx, p.x, p.y, p.s);
          break;
        case 'dock':
          drawDock(ctx, p.x, p.y, p.s);
          break;
        case 'windmill':
          drawWindmill(ctx, p.x, p.y, p.s, time * 0.7 + p.phase * 6.28);
          break;
      }
    }

    if (zoom >= CAMERA.lodPeople) this.drawTravelers(ctx, bounds);
  }

  private drawTravelers(ctx: CanvasRenderingContext2D, bounds: Bounds) {
    for (const tr of this.travelers) {
      const i = Math.min(tr.path.length - 1, Math.max(0, Math.floor(tr.t * (tr.path.length - 1))));
      const p = tr.path[i];
      if (!p || p.x < bounds.minX || p.x > bounds.maxX || p.y < bounds.minY || p.y > bounds.maxY) continue;
      const facingLeft = tr.dir < 0;
      const key = tr.kind === 'cart' ? tr.cargo : 'terrain/peasants';
      const scale = tr.kind === 'cart' ? 0.19 : 0.15;
      assets.drawShadow(ctx, p.x, p.y + 2, tr.kind === 'cart' ? 16 : 9);
      if (assets.draw(ctx, key, p.x, p.y, scale, { flip: facingLeft })) continue;

      if (tr.kind === 'cart') {
        ctx.fillStyle = PALETTE.wood;
        ctx.fillRect(p.x - 8, p.y - 9, 16, 7);
        ctx.fillStyle = '#efe7d6';
        ctx.beginPath();
        ctx.ellipse(p.x, p.y - 10, 8, 5, 0, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = PALETTE.woodDark;
        ctx.beginPath();
        ctx.arc(p.x - 5, p.y - 1.5, 2.6, 0, Math.PI * 2);
        ctx.arc(p.x + 5, p.y - 1.5, 2.6, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = '#5d6f8c';
        ctx.fillRect(p.x - 2.2, p.y - 9, 4.4, 8);
        ctx.fillStyle = '#e8c39a';
        ctx.beginPath();
        ctx.arc(p.x, p.y - 11, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

/** Fumaça saindo das chaminés — mundo vivo mesmo parado (§8). */
export function drawSmoke(ctx: CanvasRenderingContext2D, x: number, y: number, time: number, s = 1) {
  for (let i = 0; i < 3; i++) {
    const t = (time * 0.35 + i * 0.33) % 1;
    const alpha = (1 - t) * 0.32;
    if (alpha <= 0.01) continue;
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.beginPath();
    ctx.arc(x + Math.sin(t * 5 + i) * 5 * s, y - t * 34 * s, (3 + t * 7) * s, 0, Math.PI * 2);
    ctx.fill();
  }
}
