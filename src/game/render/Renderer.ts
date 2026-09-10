import { PALETTE } from '../config/palette';
import type { Camera } from '../managers/Camera';
import type { GameState, Vec2 } from '../types';
import type { BuiltWorld } from '../world/WorldBuilder';
import { ArmyLayer } from './layers/ArmyLayer';
import { BorderLayer } from './layers/BorderLayer';
import { BuildingLayer } from './layers/BuildingLayer';
import { FeatureLayer } from './layers/FeatureLayer';
import { OverlayLayer } from './layers/OverlayLayer';
import { PropLayer } from './layers/PropLayer';
import { TerrainLayer } from './layers/TerrainLayer';

/**
 * Renderer — orquestra as camadas 2D.
 *
 * Ordem fixa: água → terreno → costa → rios → domínio → estradas → props →
 * fronteiras → castelos → destaques → nuvens → rótulos.
 * Nenhum elemento do mundo é DOM (§40/§74).
 */
export class Renderer {
  private terrain: TerrainLayer;
  private features: FeatureLayer;
  private borders: BorderLayer;
  private props: PropLayer;
  private buildings: BuildingLayer;
  private armiesLayer: ArmyLayer;
  readonly overlay: OverlayLayer;

  hoveredId: string | null = null;
  selectedId: string | null = null;
  /** Territórios que o jogador pode disputar a partir do selecionado (§87). */
  claimableIds: Set<string> = new Set();
  focusedDepositId: string | null = null;
  selectedBuildingId: string | null = null;
  /** Exército selecionado, destinos acesos e o arrasto em curso. */
  selectedArmyId: string | null = null;
  armyTargets: Set<string> = new Set();
  dragTo: Vec2 | null = null;
  dragTargetId: string | null = null;
  /** Camadas ligáveis pelo painel do minimapa (§conceito). */
  layers = { provinces: true, resources: true, routes: true, armies: true };

  constructor(world: BuiltWorld, private camera: Camera) {
    this.terrain = new TerrainLayer(world);
    this.features = new FeatureLayer(world);
    this.borders = new BorderLayer();
    this.props = new PropLayer(world);
    this.buildings = new BuildingLayer();
    this.armiesLayer = new ArmyLayer();
    this.overlay = new OverlayLayer(world);
  }

  update(dt: number) {
    this.props.update(dt);
    this.overlay.updateEffects(dt);
  }

  draw(ctx: CanvasRenderingContext2D, state: GameState, time: number, dpr: number) {
    const cam = this.camera;
    const w = cam.viewW;
    const h = cam.viewH;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Fundo de oceano cobrindo tudo que não é mundo.
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, PALETTE.ocean);
    g.addColorStop(1, PALETTE.oceanDeep);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);

    const bounds = cam.visibleBounds(200);
    const zoom = cam.zoom;

    this.terrain.draw(ctx, bounds, zoom);
    this.features.drawCoast(ctx, bounds, zoom, time);
    this.features.drawRivers(ctx, bounds, zoom);
    if (this.layers.provinces) this.borders.drawFills(ctx, state, bounds);
    if (this.layers.routes) this.features.drawRoads(ctx, bounds, zoom);
    this.props.draw(ctx, bounds, zoom, time);
    if (this.layers.provinces) this.borders.drawBorders(ctx, state, bounds, zoom);

    this.buildings.showDeposits = this.layers.resources;
    this.buildings.focusedDepositId = this.focusedDepositId;
    this.buildings.selectedBuildingId = this.selectedBuildingId;
    this.buildings.selectedTerritoryId = this.selectedId;
    this.buildings.draw(ctx, state, bounds, zoom, time);

    // Destinos acesos do exército selecionado, por baixo das tropas.
    if (this.selectedArmyId && this.armyTargets.size > 0) {
      for (const id of this.armyTargets) {
        const t = state.territories[id];
        if (!t) continue;
        const friendly = t.ownerId === state.playerKingdomId;
        const hovered = id === this.dragTargetId;
        this.borders.drawHighlight(
          ctx,
          t,
          friendly ? '#5cd08a' : '#f0616a',
          zoom,
          hovered,
          time,
        );
      }
    }

    if (this.layers.armies) {
      this.armiesLayer.selectedArmyId = this.selectedArmyId;
      this.armiesLayer.draw(ctx, state, bounds, zoom, time);
    }

    // Linha elástica do arrasto: de onde a coluna sai para onde ela vai.
    const dragArmy = this.selectedArmyId ? state.armies[this.selectedArmyId] : null;
    if (dragArmy && this.dragTo) {
      const target = this.dragTargetId ? state.territories[this.dragTargetId] : null;
      const friendly = target?.ownerId === state.playerKingdomId;
      const color = !target ? 'rgba(232,195,90,0.75)' : friendly ? '#5cd08a' : '#f0616a';
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 4 / zoom;
      ctx.setLineDash([16 / zoom, 11 / zoom]);
      ctx.lineDashOffset = -time * 40;
      ctx.beginPath();
      ctx.moveTo(dragArmy.position.x, dragArmy.position.y);
      ctx.lineTo(this.dragTo.x, this.dragTo.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(this.dragTo.x, this.dragTo.y, 7 / zoom + 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Destaques de seleção/hover e alvos disputáveis.
    for (const id of this.claimableIds) {
      const t = state.territories[id];
      if (t) this.borders.drawHighlight(ctx, t, '#ffd76a', zoom, false, time);
    }
    if (this.hoveredId && this.hoveredId !== this.selectedId) {
      const t = state.territories[this.hoveredId];
      if (t) this.borders.drawHighlight(ctx, t, '#ffffff', zoom, false, time);
    }
    if (this.selectedId) {
      const t = state.territories[this.selectedId];
      if (t) {
        const kingdom = t.ownerId ? state.kingdoms[t.ownerId] : null;
        this.borders.drawHighlight(ctx, t, kingdom?.color ?? '#ffffff', zoom, true, time);
      }
    }

    this.overlay.drawEffects(ctx);
    this.overlay.drawClouds(ctx, bounds, time);
    ctx.restore();

    this.overlay.drawLabels(ctx, state, cam, this.hoveredId, this.selectedId);
  }

  invalidateTerritory(id: string) {
    this.borders.invalidate(id);
  }
}
