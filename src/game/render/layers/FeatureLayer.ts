import { CAMERA } from '../../config/balance';
import { PALETTE } from '../../config/palette';
import type { Vec2 } from '../../types';
import type { BuiltWorld } from '../../world/WorldBuilder';
import { assets } from '../AssetManager';
import type { Bounds } from './TerrainLayer';

/**
 * FeatureLayer — costa, rios, estradas e pontes.
 * Tudo vetorial: fica nítido em qualquer zoom e permite animação barata.
 */
export class FeatureLayer {
  constructor(private world: BuiltWorld) {}

  drawCoast(ctx: CanvasRenderingContext2D, bounds: Bounds, zoom: number, time: number) {
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const loop of this.world.coastlines) {
      if (!intersects(loop, bounds)) continue;
      // Talude e areia úmida assentam a ilha no oceano. Só espuma branca
      // deixava a costa parecendo uma linha de editor vetorial.
      ctx.strokeStyle = 'rgba(33,58,52,0.42)';
      ctx.lineWidth = 18 / Math.max(0.58, zoom) + 5;
      strokePath(ctx, loop, true);
      ctx.strokeStyle = 'rgba(232,210,154,0.9)';
      ctx.lineWidth = 12 / Math.max(0.58, zoom) + 3;
      strokePath(ctx, loop, true);
      // Espuma pulsando suavemente
      ctx.strokeStyle = `rgba(191,233,247,${0.55 + Math.sin(time * 1.4) * 0.12})`;
      ctx.lineWidth = 7 / Math.max(0.5, zoom) + 3;
      strokePath(ctx, loop, true);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 2.4 / Math.max(0.6, zoom);
      strokePath(ctx, loop, true);
    }
  }

  drawRivers(ctx: CanvasRenderingContext2D, bounds: Bounds, zoom: number) {
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const river of this.world.rivers) {
      if (!intersects(river, bounds)) continue;
      ctx.strokeStyle = 'rgba(63,88,43,0.36)';
      ctx.lineWidth = 31;
      strokePath(ctx, river, false);
      ctx.strokeStyle = 'rgba(221,199,140,0.52)';
      ctx.lineWidth = 24;
      strokePath(ctx, river, false);
      ctx.strokeStyle = 'rgba(28,86,140,0.35)';
      ctx.lineWidth = 20;
      strokePath(ctx, river, false);
      ctx.strokeStyle = PALETTE.river;
      ctx.lineWidth = 15;
      strokePath(ctx, river, false);
      ctx.strokeStyle = PALETTE.riverLight;
      ctx.lineWidth = zoom > CAMERA.lodProps ? 5 : 3;
      strokePath(ctx, river, false);
    }
  }

  drawRoads(ctx: CanvasRenderingContext2D, bounds: Bounds, zoom: number) {
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const road of this.world.roads) {
      if (!intersects(road.points, bounds)) continue;
      ctx.strokeStyle = 'rgba(74,73,45,0.24)';
      ctx.lineWidth = 13;
      strokePath(ctx, road.points, false);
      ctx.strokeStyle = PALETTE.roadDark;
      ctx.lineWidth = 8.5;
      strokePath(ctx, road.points, false);
      ctx.strokeStyle = PALETTE.road;
      ctx.lineWidth = 5.5;
      strokePath(ctx, road.points, false);
      ctx.strokeStyle = 'rgba(255,244,203,0.48)';
      ctx.lineWidth = 1.15;
      strokePath(ctx, road.points, false);
    }
    if (zoom < CAMERA.lodProps) return;
    for (const road of this.world.roads) {
      for (const b of road.bridges) {
        if (b.x < bounds.minX || b.x > bounds.maxX || b.y < bounds.minY || b.y > bounds.maxY) continue;
        drawBridge(ctx, b);
      }
    }
  }
}

function drawBridge(ctx: CanvasRenderingContext2D, p: Vec2) {
  if (assets.draw(ctx, 'terrain/bridge_wood', p.x, p.y + 6, 0.2)) return;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.fillStyle = PALETTE.woodDark;
  ctx.fillRect(-17, -11, 34, 22);
  ctx.fillStyle = PALETTE.wood;
  ctx.fillRect(-17, -9, 34, 18);
  ctx.fillStyle = PALETTE.woodDark;
  for (let i = -2; i <= 2; i++) ctx.fillRect(i * 7 - 1.2, -11, 2.4, 22);
  ctx.restore();
}

function strokePath(ctx: CanvasRenderingContext2D, pts: Vec2[], close: boolean) {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  if (close) ctx.closePath();
  ctx.stroke();
}

export function intersects(pts: Vec2[], b: Bounds): boolean {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return !(maxX < b.minX || minX > b.maxX || maxY < b.minY || minY > b.maxY);
}
