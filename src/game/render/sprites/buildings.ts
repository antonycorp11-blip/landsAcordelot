import { PALETTE } from '../../config/palette';
import type { BuildingKind } from '../../types';

type Ctx = CanvasRenderingContext2D;

/**
 * Desenhos vetoriais das construções que ainda não têm arte dedicada.
 * Mesmo estilo do resto: base isométrica, cores chapadas, sombra sob o objeto.
 */

function ground(ctx: Ctx, x: number, y: number, rx: number, color = '#7fb95a') {
  ctx.fillStyle = 'rgba(18,30,46,0.20)';
  ctx.beginPath();
  ctx.ellipse(x + 4, y + 4, rx, rx * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x - rx, y);
  ctx.lineTo(x, y - rx * 0.5);
  ctx.lineTo(x + rx, y);
  ctx.lineTo(x, y + rx * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fill();
}

function shed(ctx: Ctx, x: number, y: number, w: number, h: number, roof: string) {
  ctx.fillStyle = PALETTE.wall;
  ctx.fillRect(x - w / 2, y - h, w, h);
  ctx.fillStyle = PALETTE.wallShadow;
  ctx.fillRect(x + w * 0.18, y - h, w * 0.32, h);
  ctx.fillStyle = roof;
  ctx.beginPath();
  ctx.moveTo(x - w * 0.68, y - h);
  ctx.lineTo(x, y - h - w * 0.42);
  ctx.lineTo(x + w * 0.68, y - h);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.moveTo(x, y - h - w * 0.42);
  ctx.lineTo(x + w * 0.68, y - h);
  ctx.lineTo(x + w * 0.2, y - h);
  ctx.closePath();
  ctx.fill();
}

function logs(ctx: Ctx, x: number, y: number, s: number) {
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 3 - row; i++) {
      const lx = x + (i - (2 - row) / 2) * 10 * s;
      const ly = y - row * 8 * s;
      ctx.fillStyle = PALETTE.woodDark;
      ctx.beginPath();
      ctx.ellipse(lx, ly, 5 * s, 4.2 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#c08c4f';
      ctx.beginPath();
      ctx.ellipse(lx, ly, 3.2 * s, 2.6 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Fallback vetorial por tipo de construção. */
export function drawBuildingVector(ctx: Ctx, kind: BuildingKind, x: number, y: number, s: number, accent: string) {
  switch (kind) {
    case 'lumberjack': {
      ground(ctx, x, y, 44 * s);
      shed(ctx, x - 8 * s, y - 2 * s, 34 * s, 22 * s, PALETTE.thatch);
      logs(ctx, x + 26 * s, y - 2 * s, s);
      ctx.fillStyle = accent;
      ctx.fillRect(x - 30 * s, y - 46 * s, 3 * s, 24 * s);
      break;
    }
    case 'brickworks': {
      ground(ctx, x, y, 44 * s, '#a89878');
      shed(ctx, x, y, 40 * s, 24 * s, '#b8563f');
      // Forno
      ctx.fillStyle = '#8c7358';
      ctx.beginPath();
      ctx.moveTo(x + 20 * s, y);
      ctx.lineTo(x + 20 * s, y - 26 * s);
      ctx.quadraticCurveTo(x + 30 * s, y - 34 * s, x + 38 * s, y - 24 * s);
      ctx.lineTo(x + 38 * s, y);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#f0a33d';
      ctx.beginPath();
      ctx.ellipse(x + 29 * s, y - 8 * s, 5 * s, 7 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      // Pilha de tijolos
      ctx.fillStyle = '#c8674a';
      for (let i = 0; i < 3; i++) ctx.fillRect(x - 40 * s, y - 6 * s - i * 5 * s, 16 * s, 4 * s);
      break;
    }
    case 'foundry': {
      ground(ctx, x, y, 46 * s, '#9a9a9a');
      shed(ctx, x - 4 * s, y, 44 * s, 26 * s, '#6d7482');
      ctx.fillStyle = PALETTE.wallDark;
      ctx.fillRect(x + 22 * s, y - 44 * s, 12 * s, 44 * s);
      ctx.fillStyle = '#f0a33d';
      ctx.beginPath();
      ctx.arc(x - 6 * s, y - 12 * s, 7 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffd98a';
      ctx.beginPath();
      ctx.arc(x - 6 * s, y - 12 * s, 3.4 * s, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'mint': {
      ground(ctx, x, y, 44 * s, '#b7ab7f');
      shed(ctx, x, y, 42 * s, 28 * s, accent);
      ctx.fillStyle = PALETTE.gold;
      ctx.beginPath();
      ctx.arc(x, y - 40 * s, 8 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.arc(x, y - 40 * s, 4 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.gold;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(x - 26 * s + i * 5 * s, y - 4 * s - i * 3 * s, 6 * s, 2.6 * s, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'house': {
      ground(ctx, x, y, 34 * s);
      shed(ctx, x - 10 * s, y, 26 * s, 20 * s, PALETTE.roof);
      shed(ctx, x + 14 * s, y - 3 * s, 20 * s, 16 * s, '#d98a4a');
      break;
    }
    case 'warehouse': {
      ground(ctx, x, y, 46 * s, '#a89878');
      shed(ctx, x, y, 52 * s, 26 * s, '#8a6d4f');
      ctx.fillStyle = '#5b4630';
      ctx.fillRect(x - 8 * s, y - 18 * s, 16 * s, 18 * s);
      ctx.fillStyle = PALETTE.wood;
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(x - 44 * s + i * 12 * s, y - 10 * s, 10 * s, 10 * s);
      }
      break;
    }
    case 'barracks': {
      ground(ctx, x, y, 48 * s, '#9aa06c');
      shed(ctx, x, y, 50 * s, 28 * s, accent);
      // Torre de vigia
      ctx.fillStyle = PALETTE.wall;
      ctx.fillRect(x + 26 * s, y - 46 * s, 18 * s, 46 * s);
      ctx.fillStyle = PALETTE.wallShadow;
      ctx.fillRect(x + 37 * s, y - 46 * s, 7 * s, 46 * s);
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.moveTo(x + 22 * s, y - 46 * s);
      ctx.lineTo(x + 35 * s, y - 62 * s);
      ctx.lineTo(x + 48 * s, y - 46 * s);
      ctx.closePath();
      ctx.fill();
      // Armas encostadas
      ctx.strokeStyle = PALETTE.woodDark;
      ctx.lineWidth = 2.2 * s;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(x - 30 * s + i * 7 * s, y);
        ctx.lineTo(x - 26 * s + i * 7 * s, y - 26 * s);
        ctx.stroke();
      }
      break;
    }
    default: {
      ground(ctx, x, y, 40 * s);
      shed(ctx, x, y, 36 * s, 24 * s, PALETTE.roof);
    }
  }
}

/** Andaime de obra — mostra que algo está sendo construído (§71). */
export function drawConstruction(ctx: Ctx, x: number, y: number, s: number, progress: number) {
  ground(ctx, x, y, 40 * s, '#b6a882');
  ctx.strokeStyle = PALETTE.wood;
  ctx.lineWidth = 3 * s;
  const w = 34 * s;
  const h = 30 * s;
  ctx.beginPath();
  ctx.rect(x - w / 2, y - h, w, h);
  ctx.moveTo(x - w / 2, y - h / 2);
  ctx.lineTo(x + w / 2, y - h / 2);
  ctx.moveTo(x - w / 2, y);
  ctx.lineTo(x + w / 2, y - h);
  ctx.stroke();

  // Parede subindo conforme o progresso
  ctx.fillStyle = PALETTE.wall;
  ctx.fillRect(x - w / 2 + 3 * s, y - h * progress, w - 6 * s, h * progress);

  ctx.fillStyle = 'rgba(10,16,26,0.75)';
  ctx.beginPath();
  ctx.roundRect(x - 22 * s, y - h - 22 * s, 44 * s, 13 * s, 4 * s);
  ctx.fill();
  ctx.fillStyle = '#f2c33d';
  ctx.fillRect(x - 19 * s, y - h - 19 * s, 38 * s * progress, 7 * s);
}
