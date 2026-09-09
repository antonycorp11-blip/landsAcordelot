import { PALETTE } from '../config/palette';
import type { Camera } from '../managers/Camera';
import type { GameState } from '../types';
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
    this.borders.drawFills(ctx, state, bounds);
    this.features.drawRoads(ctx, bounds, zoom);
    this.props.draw(ctx, bounds, zoom, time);
    this.borders.drawBorders(ctx, state, bounds, zoom);

    this.buildings.focusedDepositId = this.focusedDepositId;
    this.buildings.selectedBuildingId = this.selectedBuildingId;
    this.buildings.selectedTerritoryId = this.selectedId;
    this.buildings.draw(ctx, state, bounds, zoom, time);

    this.armiesLayer.draw(ctx, state, bounds, zoom, time);

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
