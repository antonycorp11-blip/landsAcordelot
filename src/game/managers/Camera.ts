import { CAMERA } from '../config/balance';
import type { Vec2 } from '../types';

/**
 * Câmera 2D: pan, zoom, foco suave e conversão tela<->mundo.
 * O mundo inteiro é desenhado sob a transformação desta câmera.
 */
export class Camera {
  x = 0;
  y = 0;
  zoom: number = CAMERA.startZoom;

  viewW = 1;
  viewH = 1;

  private targetX: number | null = null;
  private targetY: number | null = null;
  private targetZoom: number | null = null;
  private vx = 0;
  private vy = 0;

  constructor(
    private worldW: number,
    private worldH: number,
  ) {}

  setViewport(w: number, h: number) {
    this.viewW = w;
    this.viewH = h;
    this.clampZoom();
    this.clamp();
  }

  screenToWorld(sx: number, sy: number): Vec2 {
    return { x: this.x + (sx - this.viewW / 2) / this.zoom, y: this.y + (sy - this.viewH / 2) / this.zoom };
  }

  /**
   * Zoom mínimo: o suficiente para o mundo inteiro caber na tela.
   *
   * Era um número fixo, o que bastava enquanto o mapa tinha um tamanho só.
   * Com o País, afastar até o limite ainda deixava metade do continente
   * fora do quadro — e um mapa que você não consegue ver inteiro não serve
   * para decidir para onde marchar.
   */
  private floorZoom(): number {
    const fit = Math.min(this.viewW / this.worldW, this.viewH / this.worldH) * 0.98;
    return Math.max(0.06, Math.min(CAMERA.minZoom, fit));
  }

  /** O mapa cresceu: a câmera passa a poder ir mais longe (§5). */
  setBounds(width: number, height: number) {
    this.worldW = width;
    this.worldH = height;
    this.clampZoom();
  }

  worldToScreen(wx: number, wy: number): Vec2 {
    return { x: (wx - this.x) * this.zoom + this.viewW / 2, y: (wy - this.y) * this.zoom + this.viewH / 2 };
  }

  /** Retângulo do mundo visível, com margem para culling. */
  visibleBounds(margin = 120) {
    const hw = this.viewW / 2 / this.zoom + margin;
    const hh = this.viewH / 2 / this.zoom + margin;
    return { minX: this.x - hw, minY: this.y - hh, maxX: this.x + hw, maxY: this.y + hh };
  }

  panBy(dxScreen: number, dyScreen: number) {
    this.targetX = null;
    this.targetY = null;
    this.x -= dxScreen / this.zoom;
    this.y -= dyScreen / this.zoom;
    this.vx = -dxScreen / this.zoom;
    this.vy = -dyScreen / this.zoom;
    this.clamp();
  }

  /** Zoom mantendo o ponto do mundo sob o cursor. */
  zoomAt(sx: number, sy: number, factor: number) {
    const before = this.screenToWorld(sx, sy);
    this.targetZoom = null;
    this.zoom = clamp(this.zoom * factor, this.floorZoom(), CAMERA.maxZoom);
    const after = this.screenToWorld(sx, sy);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
    this.clamp();
  }

  focus(p: Vec2, zoom?: number) {
    this.targetX = p.x;
    this.targetY = p.y;
    if (zoom !== undefined) this.targetZoom = clamp(zoom, this.floorZoom(), CAMERA.maxZoom);
    this.vx = 0;
    this.vy = 0;
  }

  /** O mundo andou embaixo da câmera: acompanha, sem salto na tela. */
  nudge(dx: number, dy: number) {
    if (dx === 0 && dy === 0) return;
    this.x += dx;
    this.y += dy;
    if (this.targetX !== null) this.targetX += dx;
    if (this.targetY !== null) this.targetY += dy;
  }

  jumpTo(p: Vec2, zoom?: number) {
    this.x = p.x;
    this.y = p.y;
    if (zoom !== undefined) this.zoom = clamp(zoom, this.floorZoom(), CAMERA.maxZoom);
    this.targetX = null;
    this.targetY = null;
    this.targetZoom = null;
    this.clamp();
  }

  update(dt: number) {
    const k = 1 - Math.pow(0.0025, dt);
    if (this.targetX !== null && this.targetY !== null) {
      this.x += (this.targetX - this.x) * k;
      this.y += (this.targetY - this.y) * k;
      if (Math.hypot(this.targetX - this.x, this.targetY - this.y) < 2) {
        this.targetX = null;
        this.targetY = null;
      }
    } else if (Math.abs(this.vx) > 0.05 || Math.abs(this.vy) > 0.05) {
      this.x += this.vx;
      this.y += this.vy;
      this.vx *= CAMERA.panInertia;
      this.vy *= CAMERA.panInertia;
    }
    if (this.targetZoom !== null) {
      this.zoom += (this.targetZoom - this.zoom) * k;
      if (Math.abs(this.targetZoom - this.zoom) < 0.002) {
        this.zoom = this.targetZoom;
        this.targetZoom = null;
      }
    }
    // A tela pode ter medido zero no attach; aqui o piso já é real.
    this.clampZoom();
    this.clamp();
  }

  /**
   * Reavalia o zoom contra o piso atual.
   *
   * O piso depende da viewport, e no `attach` a tela ainda pode medir zero —
   * ali o piso desaba para o mínimo absoluto e um enquadramento de mundo
   * congelava num mapa minúsculo cercado de vazio. Toda vez que a viewport ou
   * o tamanho do mundo mudam, o zoom volta para dentro dos limites.
   */
  private clampZoom() {
    if (this.viewW <= 1 || this.viewH <= 1) return;
    const floor = this.floorZoom();
    if (this.zoom < floor) this.zoom = floor;
    if (this.targetZoom !== null && this.targetZoom < floor) this.targetZoom = floor;
  }

  private clamp() {
    // Permite folga para o mundo "respirar" nas bordas (nuvens/mar).
    const marginX = Math.max(0, this.viewW / 2 / this.zoom - 260);
    const marginY = Math.max(0, this.viewH / 2 / this.zoom - 260);
    this.x = clamp(this.x, -marginX, this.worldW + marginX);
    this.y = clamp(this.y, -marginY, this.worldH + marginY);
  }
}

function clamp(v: number, a: number, b: number) {
  return v < a ? a : v > b ? b : v;
}
