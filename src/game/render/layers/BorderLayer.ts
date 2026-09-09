import { PALETTE } from '../../config/palette';
import type { GameState, Territory } from '../../types';
import { rgbaCss } from '../color';
import type { Bounds } from './TerrainLayer';

/**
 * BorderLayer — domínio visível no mapa.
 *
 * Regra de estilo (§7): nada de cor chapada cobrindo o mapa. O domínio aparece
 * como leve tonalidade + brilho interno na borda + linha de contorno.
 * Os Path2D são cacheados: a geometria não muda a cada frame.
 */
export class BorderLayer {
  private paths = new Map<string, Path2D>();

  private pathFor(t: Territory): Path2D | null {
    if (t.polygon.length < 3) return null;
    let p = this.paths.get(t.id);
    if (!p) {
      p = new Path2D();
      p.moveTo(t.polygon[0].x, t.polygon[0].y);
      for (let i = 1; i < t.polygon.length; i++) p.lineTo(t.polygon[i].x, t.polygon[i].y);
      p.closePath();
      this.paths.set(t.id, p);
    }
    return p;
  }

  /** Tonalidade de domínio — desenhada logo acima do terreno. */
  drawFills(ctx: CanvasRenderingContext2D, state: GameState, bounds: Bounds) {
    for (const t of Object.values(state.territories)) {
      if (!inView(t, bounds)) continue;
      const path = this.pathFor(t);
      if (!path) continue;
      const kingdom = t.ownerId ? state.kingdoms[t.ownerId] : null;
      const color = kingdom?.color ?? PALETTE.neutral;
      ctx.fillStyle = rgbaCss(color, kingdom ? 0.19 : 0.06);
      ctx.fill(path);
      if (t.locked) {
        ctx.fillStyle = PALETTE.lockedVeil;
        ctx.fill(path);
      }
    }
  }

  /**
   * Contornos — desenhados acima da vegetação para máxima legibilidade.
   * A fita tem três camadas: vinco escuro, faixa branca e o fio da cor do
   * reino. É o que faz a fronteira "saltar" do mapa como nas referências.
   */
  drawBorders(ctx: CanvasRenderingContext2D, state: GameState, bounds: Bounds, zoom: number) {
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const visible: { t: Territory; path: Path2D }[] = [];
    for (const t of Object.values(state.territories)) {
      if (!inView(t, bounds)) continue;
      const path = this.pathFor(t);
      if (path) visible.push({ t, path });
    }

    // 1. Brilho interno — a cor do dono "vaza" para dentro do território.
    for (const { t, path } of visible) {
      const kingdom = t.ownerId ? state.kingdoms[t.ownerId] : null;
      const color = kingdom?.color ?? PALETTE.neutral;
      ctx.save();
      ctx.clip(path);
      ctx.strokeStyle = rgbaCss(color, kingdom ? 0.5 : 0.2);
      ctx.lineWidth = 30 / zoom;
      ctx.stroke(path);
      ctx.strokeStyle = rgbaCss(color, kingdom ? 0.55 : 0.25);
      ctx.lineWidth = 12 / zoom;
      ctx.stroke(path);
      ctx.restore();
    }

    // 2. Vinco escuro — dá contraste sobre grama clara e sobre floresta.
    for (const { t, path } of visible) {
      ctx.strokeStyle = t.ownerId ? 'rgba(16,24,38,0.5)' : 'rgba(16,24,38,0.3)';
      ctx.lineWidth = 9.5 / zoom;
      ctx.stroke(path);
    }

    // 3. Fita branca + fio colorido.
    for (const { t, path } of visible) {
      const kingdom = t.ownerId ? state.kingdoms[t.ownerId] : null;
      const isPlayer = kingdom?.id === state.playerKingdomId;
      const color = kingdom?.color ?? PALETTE.neutral;
      const line = isPlayer ? PALETTE.gold : color;

      if (!kingdom) ctx.setLineDash([16 / zoom, 11 / zoom]);
      ctx.strokeStyle = kingdom ? 'rgba(255,255,255,0.94)' : 'rgba(226,234,244,0.6)';
      ctx.lineWidth = (isPlayer ? 6.4 : 5) / zoom;
      ctx.stroke(path);
      ctx.strokeStyle = kingdom ? line : PALETTE.neutralDark;
      ctx.lineWidth = (isPlayer ? 3.6 : 2.8) / zoom;
      ctx.stroke(path);
      ctx.setLineDash([]);
    }
  }

  /** Realce de hover/seleção (§86). */
  drawHighlight(
    ctx: CanvasRenderingContext2D,
    t: Territory,
    color: string,
    zoom: number,
    strong: boolean,
    time: number,
  ) {
    const path = this.pathFor(t);
    if (!path) return;
    ctx.save();
    if (strong) {
      ctx.clip(path);
      ctx.fillStyle = rgbaCss(color, 0.14);
      ctx.fill(path);
      ctx.strokeStyle = rgbaCss(color, 0.5);
      ctx.lineWidth = 34 / zoom;
      ctx.stroke(path);
      ctx.restore();
      ctx.save();
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.fill(path);
    }
    const pulse = strong ? 0.75 + Math.sin(time * 3.2) * 0.25 : 0.6;
    ctx.strokeStyle = `rgba(255,255,255,${pulse})`;
    ctx.lineWidth = (strong ? 6.5 : 4) / zoom;
    ctx.stroke(path);
    ctx.restore();
  }

  invalidate(id?: string) {
    if (id) this.paths.delete(id);
    else this.paths.clear();
  }
}

function inView(t: Territory, b: Bounds): boolean {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of t.polygon) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return !(maxX < b.minX || minX > b.maxX || maxY < b.minY || minY > b.maxY);
}
