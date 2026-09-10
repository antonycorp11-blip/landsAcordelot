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
  drawClouds(ctx: CanvasRenderingContext2D, bounds: Bounds, time: number, zoom: number) {
    ctx.save();
    const stride = zoom < 0.18 ? 3 : 1;
    for (let i = 0; i < this.clouds.length; i += stride) {
      const c = this.clouds[i];
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
    const bounds = camera.visibleBounds(220);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Na escala do País os nomes das províncias virariam ruído. Em vez de
    // apagar toda a informação, agrupamos por dono e nomeamos cada Estado.
    if (camera.zoom < CAMERA.lodLabels) {
      this.drawRealmLabels(ctx, state, camera, bounds);
      return;
    }

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

  private drawRealmLabels(
    ctx: CanvasRenderingContext2D,
    state: GameState,
    camera: Camera,
    bounds: Bounds,
  ) {
    const placed: {
      p: Vec2;
      kingdom: GameState['kingdoms'][string];
      holdings: number;
      player: boolean;
    }[] = [];
    const byKingdom = new Map<string, Territory[]>();
    for (const t of Object.values(state.territories)) {
      if (!t.ownerId) continue;
      const list = byKingdom.get(t.ownerId);
      if (list) list.push(t);
      else byKingdom.set(t.ownerId, [t]);
    }
    for (const kingdom of Object.values(state.kingdoms)) {
      const holdings = byKingdom.get(kingdom.id) ?? [];
      if (holdings.length === 0) continue;

      let x = 0;
      let y = 0;
      let total = 0;
      for (const t of holdings) {
        const weight = Math.max(1, t.area);
        x += t.center.x * weight;
        y += t.center.y * weight;
        total += weight;
      }
      x /= total;
      y /= total;
      if (x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY) continue;
      const screen = camera.worldToScreen(x, y);
      placed.push({
        p: screen,
        kingdom,
        holdings: holdings.length,
        player: kingdom.id === state.playerKingdomId,
      });
    }

    // O seu Estado se desenha por último: fica por cima em caso de disputa.
    placed.sort((a, b) => Number(a.player) - Number(b.player));

    const taken: Rect[] = [];
    for (const chip of placed) {
      const w = realmChipWidth(ctx, chip.kingdom.name, chip.player);
      // O trilho lateral come a borda esquerda da tela; um rótulo por baixo
      // dele é informação perdida, então empurramos para dentro do mapa.
      const left = RAIL_INSET + w / 2;
      const right = camera.viewW - 16 - w / 2;
      chip.p.x = left > right ? (left + right) / 2 : Math.max(left, Math.min(right, chip.p.x));
      chip.p.y = Math.max(TOP_INSET + CHIP_H / 2, Math.min(camera.viewH - 24, chip.p.y));
      // Dois Estados vizinhos podem cair no mesmo ponto da tela; nesse caso
      // o de baixo desce até caber, em vez de virar um borrão ilegível.
      let guard = 0;
      while (guard++ < 12 && taken.some((r) => overlaps(r, chip.p, w))) {
        chip.p.y += CHIP_H + 6;
        if (chip.p.y > camera.viewH - 24) {
          chip.p.y = TOP_INSET + CHIP_H / 2;
          chip.p.x += w * 0.55;
        }
      }
      taken.push({ x: chip.p.x - w / 2, y: chip.p.y - CHIP_H / 2, w, h: CHIP_H });
      const scale = chip.player ? state.stage : chip.kingdom.scale;
      drawRealmChip(ctx, chip.p, chip.kingdom, chip.holdings, chip.player, scale === 'state');
    }
  }
}

/** Largura do trilho lateral mais uma folga; nada legível vive à esquerda disto. */
const RAIL_INSET = 84;
const TOP_INSET = 62;
const CHIP_H = 42;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function overlaps(r: Rect, p: Vec2, w: number): boolean {
  return (
    Math.abs(r.x + r.w / 2 - p.x) < (r.w + w) / 2 + 8 &&
    Math.abs(r.y + r.h / 2 - p.y) < CHIP_H + 6
  );
}

function realmChipFont(player: boolean): string {
  return `${player ? 760 : 680} ${player ? 13 : 12}px "Inter", "Segoe UI", system-ui, sans-serif`;
}

function realmChipWidth(ctx: CanvasRenderingContext2D, name: string, player: boolean): number {
  ctx.font = realmChipFont(player);
  return Math.max(150, ctx.measureText(name.toUpperCase()).width + 48);
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

function drawRealmChip(
  ctx: CanvasRenderingContext2D,
  p: Vec2,
  kingdom: GameState['kingdoms'][string],
  holdings: number,
  player: boolean,
  stateScale: boolean,
) {
  const name = kingdom.name.toUpperCase();
  ctx.font = realmChipFont(player);
  const w = realmChipWidth(ctx, kingdom.name, player);
  const h = CHIP_H;
  const x = p.x - w / 2;
  const y = p.y - h / 2;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.55)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = player ? 'rgba(9,27,48,.94)' : 'rgba(9,18,30,.88)';
  roundRect(ctx, x, y, w, h, 11);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = hexA(player ? '#f2c33d' : kingdom.color, 0.95);
  ctx.lineWidth = player ? 2 : 1.5;
  roundRect(ctx, x, y, w, h, 11);
  ctx.stroke();

  drawEmblem(ctx, x + 20, p.y, 9, kingdom.emblem, kingdom.color);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#f4f7fb';
  ctx.fillText(name, x + 37, y + 15);
  ctx.font = '700 8px "Inter", "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = player ? '#f4d77d' : 'rgba(210,222,237,.76)';
  const scale = stateScale ? 'ESTADO' : 'REINO';
  ctx.fillText(`${scale} · ${holdings} ${holdings === 1 ? 'PROVÍNCIA' : 'PROVÍNCIAS'}`, x + 37, y + 29);
  ctx.restore();
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
