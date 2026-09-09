import { CAMERA } from '../../config/balance';
import { BUILDING_DEFS } from '../../data/defs';
import type { Building, Deposit, GameState } from '../../types';
import { assets } from '../AssetManager';
import { drawBuildingVector, drawConstruction } from '../sprites/buildings';
import { BUILDING_SPRITE, DEPOSIT_COLOR } from '../spriteCatalog';
import type { Bounds } from './TerrainLayer';

/**
 * BuildingLayer — depósitos e construções.
 *
 * É esta camada que faz o mapa deixar de ser um cenário e virar o painel de
 * produção do jogador: o que existe no solo, o que já foi explorado, o que
 * está em obra e o que está parado por falta de gente.
 */
export class BuildingLayer {
  /** Depósito destacado pela UI (aba Construir). */
  focusedDepositId: string | null = null;
  selectedTerritoryId: string | null = null;

  draw(ctx: CanvasRenderingContext2D, state: GameState, bounds: Bounds, zoom: number, time: number) {
    if (zoom < CAMERA.lodBuildings) return;

    const visibleDeposits: Deposit[] = [];
    for (const d of Object.values(state.deposits)) {
      if (d.buildingId) continue;
      if (d.position.x < bounds.minX || d.position.x > bounds.maxX) continue;
      if (d.position.y < bounds.minY || d.position.y > bounds.maxY) continue;
      visibleDeposits.push(d);
    }

    const visibleBuildings: Building[] = [];
    for (const b of Object.values(state.buildings)) {
      if (b.position.x < bounds.minX || b.position.x > bounds.maxX) continue;
      if (b.position.y < bounds.minY || b.position.y > bounds.maxY) continue;
      visibleBuildings.push(b);
    }
    visibleBuildings.sort((a, b) => a.position.y - b.position.y);

    for (const d of visibleDeposits) this.drawDeposit(ctx, d, zoom, time);
    for (const b of visibleBuildings) this.drawBuilding(ctx, state, b, zoom, time);
  }

  private drawDeposit(ctx: CanvasRenderingContext2D, d: Deposit, zoom: number, time: number) {
    const focused = d.id === this.focusedDepositId;
    const inSelected = d.territoryId === this.selectedTerritoryId;
    const color = DEPOSIT_COLOR[d.kind];
    const { x, y } = d.position;

    const pulse = focused ? 0.6 + Math.sin(time * 4) * 0.4 : inSelected ? 0.55 : 0.28;
    const r = (focused ? 30 : 22) / Math.max(0.7, zoom / 0.9);

    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3 / zoom + 1;
    ctx.setLineDash([7 / zoom, 5 / zoom]);
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.5, r * 0.62, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = pulse * 0.35;
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();

    // Ícone do recurso flutuando sobre o depósito.
    if (!inSelected && !focused) return;
    const iy = y - r * 1.5;
    ctx.fillStyle = 'rgba(10,16,26,0.82)';
    ctx.beginPath();
    ctx.arc(x, iy, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = color;
    drawDepositGlyph(ctx, d.kind, x, iy, 7);
  }

  private drawBuilding(
    ctx: CanvasRenderingContext2D,
    state: GameState,
    b: Building,
    zoom: number,
    time: number,
  ) {
    const def = BUILDING_DEFS[b.defId];
    if (!def) return;
    const { x, y } = b.position;
    const kingdomId = state.territories[b.territoryId]?.ownerId;
    const kingdom = kingdomId ? state.kingdoms[kingdomId] : null;
    const accent = kingdom?.color ?? '#8b95a2';

    if (b.construction > 0) {
      const total = Math.max(1, def.buildTime * Math.pow(1.55, Math.max(0, b.targetLevel - 1)));
      drawConstruction(ctx, x, y, 1, Math.max(0.04, 1 - b.construction / total));
      return;
    }

    const scale = 0.5 + b.level * 0.09;
    const key = BUILDING_SPRITE[b.defId];
    const isPlayerColor = kingdom?.ownerKind === 'PLAYER';
    const drew =
      key &&
      assets.draw(ctx, key, x, y, scale, {
        tint: isPlayerColor ? undefined : accent,
        tintAlpha: 0.26,
      });
    if (!drew) drawBuildingVector(ctx, b.defId, x, y, scale * 1.15, accent);

    if (zoom < CAMERA.lodPeople) return;

    // Vida ao redor da produção: gado na fazenda, gente nas oficinas.
    if (b.workers > 0) {
      const sway = Math.sin(time * 0.6 + x * 0.01) * 6;
      if (b.defId === 'farm') {
        assets.draw(ctx, 'terrain/cattle', x - 62 * scale + sway, y + 16 * scale, 0.16);
      } else if (b.defId === 'lumberjack' || b.defId === 'sawmill') {
        assets.draw(ctx, 'terrain/wagon_logs', x + 66 * scale - sway, y + 14 * scale, 0.15, {
          flip: sway > 0,
        });
      } else {
        assets.draw(ctx, 'terrain/peasants', x - 58 * scale + sway, y + 14 * scale, 0.12);
      }
    }

    // Selo de mão de obra: quantos trabalhadores e se está parado.
    const jobs = def.jobsPerLevel * b.level;
    if (jobs <= 0) return;
    const idle = b.workers === 0;
    const starving = !idle && b.efficiency < 0.55;
    const bx = x + 26 * scale;
    const by = y - 54 * scale;

    ctx.fillStyle = idle ? 'rgba(120,26,32,0.9)' : starving ? 'rgba(140,96,20,0.9)' : 'rgba(10,16,26,0.82)';
    ctx.beginPath();
    ctx.roundRect(bx - 20, by - 10, 40, 19, 6);
    ctx.fill();
    ctx.strokeStyle = idle ? '#f0616a' : starving ? '#f2c33d' : 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.fillStyle = '#eef4fb';
    ctx.font = '600 11px "Inter", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(idle ? 'sem gente' : `${b.workers}/${jobs}`, bx, by);

    if (idle) {
      // Chama a atenção sem gritar.
      ctx.globalAlpha = 0.5 + Math.sin(time * 3) * 0.4;
      ctx.fillStyle = '#f0616a';
      ctx.beginPath();
      ctx.arc(bx + 24, by, 3.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}

function drawDepositGlyph(
  ctx: CanvasRenderingContext2D,
  kind: Deposit['kind'],
  x: number,
  y: number,
  r: number,
) {
  switch (kind) {
    case 'forest':
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.lineTo(x - r * 0.8, y + r * 0.4);
      ctx.lineTo(x + r * 0.8, y + r * 0.4);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(x - r * 0.15, y + r * 0.3, r * 0.3, r * 0.6);
      break;
    case 'farmland':
      for (let i = -1; i <= 1; i++) {
        ctx.fillRect(x + i * r * 0.55 - r * 0.12, y - r * 0.8, r * 0.24, r * 1.6);
      }
      break;
    case 'gold':
      ctx.beginPath();
      ctx.ellipse(x, y, r * 0.9, r * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    default:
      ctx.beginPath();
      ctx.moveTo(x - r, y + r * 0.5);
      ctx.lineTo(x - r * 0.3, y - r * 0.8);
      ctx.lineTo(x + r * 0.6, y - r * 0.4);
      ctx.lineTo(x + r, y + r * 0.5);
      ctx.closePath();
      ctx.fill();
  }
}
