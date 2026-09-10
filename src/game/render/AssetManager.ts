/**
 * AssetManager — carrega os sprites do jogo e mantém variantes tingidas.
 *
 * Regras:
 *  - carregamento preguiçoso: só busca o arquivo quando alguém pede;
 *  - enquanto a imagem não chega, o chamador desenha o fallback vetorial;
 *  - o tingimento por cor de reino é pré-calculado em canvas e cacheado,
 *    para não custar nada por frame.
 */

import { assetUrl, spriteUrl } from '../config/version';

export interface SpriteMeta {
  w: number;
  h: number;
  /** Fração da altura onde o sprite toca o chão. */
  ay: number;
}

type Manifest = Record<string, SpriteMeta>;

export class AssetManager {
  private manifest: Manifest = {};
  private images = new Map<string, HTMLImageElement>();
  private failed = new Set<string>();
  private tinted = new Map<string, HTMLCanvasElement>();
  private base: string;
  ready = false;

  constructor(base = '/assets') {
    this.base = base;
  }

  async load(): Promise<void> {
    try {
      const res = await fetch(assetUrl(`${this.base}/manifest.json`), { cache: 'no-cache' });
      if (res.ok) this.manifest = (await res.json()) as Manifest;
    } catch {
      this.manifest = {};
    }
    this.ready = true;
  }

  has(key: string): boolean {
    return this.manifest[key] !== undefined && !this.failed.has(key);
  }

  meta(key: string): SpriteMeta | null {
    return this.manifest[key] ?? null;
  }

  /** Devolve a imagem se já carregada; dispara o carregamento na primeira chamada. */
  get(key: string): HTMLImageElement | null {
    if (!this.has(key)) return null;
    const cached = this.images.get(key);
    if (cached) return cached.complete && cached.naturalWidth > 0 ? cached : null;

    const img = new Image();
    img.decoding = 'async';
    img.src = spriteUrl(key);
    img.onerror = () => this.failed.add(key);
    this.images.set(key, img);
    return null;
  }

  /** Pré-carrega uma lista de sprites (usado na tela de abertura). */
  preload(keys: string[]) {
    for (const k of keys) this.get(k);
  }

  /** Quantos dos sprites pedidos já estão prontos — alimenta a barra de loading. */
  progress(keys: string[]): number {
    if (keys.length === 0) return 1;
    let done = 0;
    for (const k of keys) {
      if (!this.has(k)) {
        done++;
        continue;
      }
      const img = this.images.get(k);
      if (img && img.complete) done++;
    }
    return done / keys.length;
  }

  /**
   * Desenha um sprite ancorado pelo "chão".
   * `x` é o centro horizontal e `y` a linha do solo.
   */
  draw(
    ctx: CanvasRenderingContext2D,
    key: string,
    x: number,
    y: number,
    scale: number,
    opts?: { tint?: string; tintAlpha?: number; alpha?: number; flip?: boolean },
  ): boolean {
    const meta = this.manifest[key];
    if (!meta) return false;
    const img = this.get(key);
    if (!img) return false;

    const source: CanvasImageSource = opts?.tint
      ? this.tintedCanvas(key, img, opts.tint, opts.tintAlpha ?? 0.32)
      : img;

    const w = meta.w * scale;
    const h = meta.h * scale;
    const prevAlpha = ctx.globalAlpha;
    if (opts?.alpha !== undefined) ctx.globalAlpha = opts.alpha;
    if (opts?.flip) {
      ctx.save();
      ctx.translate(x, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(source, -w / 2, y - h * meta.ay, w, h);
      ctx.restore();
    } else {
      ctx.drawImage(source, x - w / 2, y - h * meta.ay, w, h);
    }
    ctx.globalAlpha = prevAlpha;
    return true;
  }

  /** Sombra elíptica sob um sprite — dá peso e assenta o objeto no terreno. */
  drawShadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number) {
    const radius = Math.max(0.01, Math.abs(rx));
    ctx.fillStyle = 'rgba(18,30,46,0.22)';
    ctx.beginPath();
    ctx.ellipse(x, y, radius, radius * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private tintedCanvas(
    key: string,
    img: HTMLImageElement,
    color: string,
    alpha: number,
  ): HTMLCanvasElement {
    const id = `${key}|${color}|${alpha}`;
    const cached = this.tinted.get(id);
    if (cached) return cached;

    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const c = canvas.getContext('2d')!;
    c.drawImage(img, 0, 0);
    c.globalCompositeOperation = 'source-atop';
    c.globalAlpha = alpha;
    c.fillStyle = color;
    c.fillRect(0, 0, canvas.width, canvas.height);
    this.tinted.set(id, canvas);
    return canvas;
  }
}

/** Instância única usada pelo renderer e pela UI. */
export const assets = new AssetManager();
