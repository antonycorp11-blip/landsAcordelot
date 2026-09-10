import { BIOME_CODE, type BuiltWorld, sampleCell } from '../../world/WorldBuilder';
import { makeRng, range } from '../../world/rng';
import { assets } from '../AssetManager';
import type { Bounds } from './TerrainLayer';

type DetailKind = 'meadow' | 'undergrowth' | 'riverbank' | 'hill' | 'scree' | 'coast';

interface GroundDetail {
  kind: DetailKind;
  x: number;
  y: number;
  scale: number;
  alpha: number;
  flip: boolean;
}

/**
 * Decoração rasa do mundo revelado.
 *
 * O relevo procedural é ótimo para mapas grandes, mas sozinho parece uma
 * camada de tinta. Estes decals ficam entre o terreno e as estradas: dão
 * textura ao chão sem virar entidades da simulação e sem custar React/DOM.
 * O bioma escolhe o vocabulário visual; assim as ondas novas recebem detalhe
 * automaticamente sem misturar flores de planície no alto de Skaldheim.
 */
export class GroundDetailLayer {
  private readonly bucketSize = 512;
  private readonly buckets = new Map<number, GroundDetail[]>();

  constructor(private world: BuiltWorld) {
    this.seedMeadows();
    this.seedRiverbanks();
  }

  draw(ctx: CanvasRenderingContext2D, bounds: Bounds, zoom: number) {
    if (zoom < 0.3) return;
    const pad = 150;
    const bx0 = Math.floor((bounds.minX - pad) / this.bucketSize);
    const bx1 = Math.floor((bounds.maxX + pad) / this.bucketSize);
    const by0 = Math.floor((bounds.minY - pad) / this.bucketSize);
    const by1 = Math.floor((bounds.maxY + pad) / this.bucketSize);

    for (let bx = bx0; bx <= bx1; bx++) {
      for (let by = by0; by <= by1; by++) {
        const bucket = this.buckets.get(bx * 100000 + by);
        if (!bucket) continue;
        for (const d of bucket) this.drawDetail(ctx, d);
      }
    }
  }

  private seedMeadows() {
    const rng = makeRng(0x51a7d0);
    const g = this.world.grid;
    const step = 138;

    for (let y = 54; y < this.world.height - 54; y += step) {
      for (let x = 54; x < this.world.width - 54; x += step) {
        const px = x + range(rng, -48, 48);
        const py = y + range(rng, -44, 44);
        const idx = sampleCell(g, px, py);
        if (idx < 0 || !g.land[idx]) continue;
        const territoryIndex = g.terr[idx];
        const territoryId = territoryIndex >= 0 ? this.world.order[territoryIndex] : null;
        if (!territoryId) continue;

        const biome = g.biome[idx];
        const roll = rng();
        if (biome === BIOME_CODE.plains || biome === BIOME_CODE.fertile) {
          if (roll < 0.58) {
            this.add({
              kind: 'meadow',
              x: px,
              y: py,
              scale: range(rng, 0.18, 0.28),
              alpha: range(rng, 0.46, 0.72),
              flip: rng() > 0.5,
            });
          }
        } else if (biome === BIOME_CODE.forest) {
          if (roll < 0.64) {
            this.add({
              kind: 'undergrowth',
              x: px,
              y: py,
              scale: range(rng, 0.15, 0.23),
              alpha: range(rng, 0.58, 0.82),
              flip: rng() > 0.5,
            });
          }
        } else if (biome === BIOME_CODE.hills && roll < 0.28) {
          this.add({
            kind: 'hill',
            x: px,
            y: py,
            scale: range(rng, 0.22, 0.3),
            alpha: range(rng, 0.4, 0.62),
            flip: rng() > 0.5,
          });
        } else if (biome === BIOME_CODE.marsh && roll < 0.42) {
          this.add({
            kind: 'undergrowth',
            x: px,
            y: py,
            scale: range(rng, 0.13, 0.19),
            alpha: range(rng, 0.36, 0.58),
            flip: rng() > 0.5,
          });
        } else if (
          (biome === BIOME_CODE.mountains || biome === BIOME_CODE.snow) &&
          roll < (biome === BIOME_CODE.snow ? 0.1 : 0.22)
        ) {
          this.add({
            kind: 'scree',
            x: px,
            y: py,
            scale: range(rng, 0.16, 0.23),
            alpha: range(rng, 0.46, 0.7),
            flip: rng() > 0.5,
          });
        } else if (biome === BIOME_CODE.sand && roll < 0.16) {
          this.add({
            kind: 'coast',
            x: px,
            y: py,
            scale: range(rng, 0.16, 0.23),
            alpha: range(rng, 0.2, 0.36),
            flip: rng() > 0.5,
          });
        }
      }
    }
  }

  private seedRiverbanks() {
    const rng = makeRng(0x71e3ba);
    for (const river of this.world.rivers) {
      for (let i = 4; i < river.length - 3; i += 8) {
        const p = river[i];
        const idx = sampleCell(this.world.grid, p.x, p.y);
        if (idx < 0) continue;
        const territoryIndex = this.world.grid.terr[idx];
        const territoryId = territoryIndex >= 0 ? this.world.order[territoryIndex] : null;
        if (!territoryId) continue;
        this.add({
          kind: 'riverbank',
          x: p.x + range(rng, -8, 8),
          y: p.y + range(rng, -5, 5),
          scale: range(rng, 0.13, 0.19),
          alpha: range(rng, 0.7, 0.92),
          flip: rng() > 0.5,
        });
      }
    }
  }

  private drawDetail(ctx: CanvasRenderingContext2D, d: GroundDetail) {
    const key =
      d.kind === 'meadow'
        ? 'nature/meadow_lush'
        : d.kind === 'undergrowth'
          ? 'nature/forest_undergrowth'
          : d.kind === 'riverbank'
            ? 'nature/forest_undergrowth'
            : d.kind === 'hill'
              ? 'terrain/green_hill'
              : d.kind === 'scree'
                ? 'terrain/boulders'
                : 'terrain/beach';
    assets.draw(ctx, key, d.x, d.y, d.scale, {
      alpha: d.alpha,
      flip: d.flip,
    });
  }

  private add(detail: GroundDetail) {
    const key =
      Math.floor(detail.x / this.bucketSize) * 100000 +
      Math.floor(detail.y / this.bucketSize);
    let bucket = this.buckets.get(key);
    if (!bucket) this.buckets.set(key, (bucket = []));
    bucket.push(detail);
  }
}
