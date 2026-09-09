import farlandsRaw from '../../data/farlands.json';
import { CAMERA } from '../../config/balance';
import type { GameState, Territory, Vec2 } from '../../types';
import { makeRng, range } from '../../world/rng';
import type { BuiltWorld } from '../../world/WorldBuilder';
import type { Camera } from '../../managers/Camera';
import { drawEmblem } from '../sprites/castle';
import type { Bounds } from './TerrainLayer';

interface Cloud {
  x: number;
  y: number;
  r: number;
  drift: number;
}

export interface WorldEffect {
  kind: 'conquest';
  x: number;
  y: number;
  age: number;
  color: string;
}

/**
 * OverlayLayer — nuvens de borda, rótulos e efeitos.
 * Os rótulos são desenhados em espaço de tela para o texto ficar sempre nítido.
 */
export class OverlayLayer {
  private clouds: Cloud[] = [];
  effects: WorldEffect[] = [];

  constructor(private world: BuiltWorld) {
    const rng = makeRng(9911);
    const W = world.width;
    const H = world.height;
    const push = (x: number, y: number) => {
      this.clouds.push({ x, y, r: range(rng, 130, 300), drift: range(rng, -1, 1) });
    };
    for (let x = -300; x < W + 300; x += 190) {
      push(x + range(rng, -60, 60), range(rng, -260, 60));
      push(x + range(rng, -60, 60), H + range(rng, -60, 260));
    }
    for (let y = -200; y < H + 200; y += 190) {
      push(range(rng, -280, 40), y + range(rng, -60, 60));
      push(W + range(rng, -40, 280), y + range(rng, -60, 60));
    }
  }

  /** Névoa/nuvens fechando as bordas: sugere um mundo maior além do mapa (§4). */
  drawClouds(ctx: CanvasRenderingContext2D, bounds: Bounds, time: number) {
    ctx.save();
    for (const c of this.clouds) {
      const x = c.x + Math.sin(time * 0.06 + c.drift * 4) * 18 * c.drift;
      if (x + c.r < bounds.minX || x - c.r > bounds.maxX) continue;
      if (c.y + c.r < bounds.minY || c.y - c.r > bounds.maxY) continue;
      const g = ctx.createRadialGradient(x, c.y, c.r * 0.15, x, c.y, c.r);
      g.addColorStop(0, 'rgba(236,244,252,0.95)');
      g.addColorStop(0.55, 'rgba(236,244,252,0.72)');
      g.addColorStop(1, 'rgba(236,244,252,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, c.y, c.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  addEffect(e: Omit<WorldEffect, 'age'>) {
    this.effects.push({ ...e, age: 0 });
  }

  updateEffects(dt: number) {
    for (const e of this.effects) e.age += dt;
    this.effects = this.effects.filter((e) => e.age < 2.2);
  }

  /** Anel de conquista (§92) — comemoração curta, sem exagero. */
  drawEffects(ctx: CanvasRenderingContext2D) {
    for (const e of this.effects) {
      const t = e.age / 2.2;
      ctx.strokeStyle = `rgba(255,255,255,${(1 - t) * 0.9})`;
      ctx.lineWidth = 6 * (1 - t) + 1;
      ctx.beginPath();
      ctx.arc(e.x, e.y, 40 + t * 260, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = hexA(e.color, (1 - t) * 0.75);
      ctx.lineWidth = 10 * (1 - t) + 1;
      ctx.beginPath();
      ctx.arc(e.x, e.y, 20 + t * 190, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  /** Rótulos de território, em espaço de tela. */
  drawLabels(
    ctx: CanvasRenderingContext2D,
    state: GameState,
    camera: Camera,
    hovered: string | null,
    selected: string | null,
  ) {
    if (camera.zoom < CAMERA.lodLabels) return;
    const bounds = camera.visibleBounds(220);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const t of Object.values(state.territories)) {
      const anchor = this.world.anchors[t.id] ?? t.center;
      if (anchor.x < bounds.minX || anchor.x > bounds.maxX || anchor.y < bounds.minY || anchor.y > bounds.maxY) {
        continue;
      }
      const castle = t.castleId ? state.castles[t.castleId] : null;
      const p = camera.worldToScreen(anchor.x, (castle?.position.y ?? anchor.y) + 42);
      const kingdom = t.ownerId ? state.kingdoms[t.ownerId] : null;
      const active = t.id === hovered || t.id === selected;
      drawLabelChip(ctx, p, t, kingdom, active);
    }

    // Nomes das terras além do mapa jogável — reforçam a escala do mundo (§4).
    ctx.font = '600 13px "Inter", "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(226,236,248,0.5)';
    for (const f of FARLANDS) {
      if (f.x < bounds.minX || f.x > bounds.maxX || f.y < bounds.minY || f.y > bounds.maxY) continue;
      const p = camera.worldToScreen(f.x, f.y);
      ctx.fillText(f.name.toUpperCase(), p.x, p.y);
    }
  }
}

const FARLANDS = farlandsRaw as { name: string; x: number; y: number }[];

function drawLabelChip(
  ctx: CanvasRenderingContext2D,
  p: Vec2,
  t: Territory,
  kingdom: GameState['kingdoms'][string] | null,
  active: boolean,
) {
  const name = t.name.toUpperCase();
  ctx.font = `600 ${active ? 13 : 12}px "Inter", "Segoe UI", system-ui, sans-serif`;
  const textW = ctx.measureText(name).width;
  const padX = 10;
  const h = 22;
  const w = textW + padX * 2 + (kingdom ? 16 : 0);
  const x = p.x - w / 2;
  const y = p.y - h / 2;

  ctx.fillStyle = active ? 'rgba(14,20,30,0.88)' : 'rgba(14,20,30,0.62)';
  roundRect(ctx, x, y, w, h, 7);
  ctx.fill();
  ctx.strokeStyle = kingdom ? hexA(kingdom.color, active ? 0.95 : 0.6) : 'rgba(185,194,205,0.5)';
  ctx.lineWidth = active ? 1.6 : 1;
  roundRect(ctx, x, y, w, h, 7);
  ctx.stroke();

  let tx = p.x;
  if (kingdom) {
    drawEmblem(ctx, x + 12, p.y, 6, kingdom.emblem, kingdom.color);
    tx = p.x + 8;
  }
  ctx.fillStyle = t.locked ? 'rgba(230,238,248,0.6)' : '#eef4fb';
  ctx.fillText(name, tx, p.y + 0.5);

  if (t.locked) {
    ctx.fillStyle = 'rgba(230,238,248,0.75)';
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText('🔒 BLOQUEADO', p.x, p.y + 18);
  }
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function hexA(hex: string, a: number) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
