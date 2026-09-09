import { PALETTE } from '../../config/palette';
import type { Castle, Kingdom } from '../../types';
import { assets } from '../AssetManager';
import { settlementScale, settlementSprite } from '../spriteCatalog';

type Ctx = CanvasRenderingContext2D;

/**
 * Desenho do assentamento. O nível muda de verdade a silhueta (§9):
 * L1 paliçada → L2 torre de pedra → L3 muralha com torres →
 * L4 fortaleza → L5 castelo dominante.
 */
export function drawSettlement(
  ctx: Ctx,
  castle: Castle,
  kingdom: Kingdom | null,
  time: number,
  detail: boolean,
) {
  const { x, y } = castle.position;
  const color = kingdom?.color ?? PALETTE.neutral;
  const dark = kingdom?.colorDark ?? PALETTE.neutralDark;

  // Arte dedicada quando existe; vetor como fallback coerente (§59).
  const key = settlementSprite(castle);
  if (key) {
    const scale = settlementScale(castle);
    assets.drawShadow(ctx, x, y + 4, 90 * scale);
    const isPlayer = kingdom?.ownerKind === 'PLAYER';
    const drew = assets.draw(ctx, key, x, y, scale, {
      // Os assets vêm com heráldica azul: os demais reinos recebem um banho
      // de cor para se distinguirem no mapa.
      tint: isPlayer || !kingdom ? undefined : kingdom.color,
      tintAlpha: 0.34,
    });
    if (drew) {
      if (kingdom && detail) {
        const meta = assets.meta(key);
        const w = (meta?.w ?? 200) * scale;
        drawFlag(ctx, x - w * 0.42, y - 8, 11, kingdom.color, time);
        drawFlag(ctx, x + w * 0.42, y - 8, 11, kingdom.color, time + 0.7);
      }
      return;
    }
  }

  ctx.save();
  ctx.translate(x, y);

  switch (castle.kind) {
    case 'village':
      drawVillage(ctx, color, detail);
      break;
    case 'town':
      drawTown(ctx, color, dark, time, detail);
      break;
    case 'fort':
      drawFort(ctx, color, dark, time);
      break;
    case 'ruin':
      drawRuin(ctx);
      break;
    default:
      drawCastle(ctx, castle.level, color, dark, time, detail);
  }

  ctx.restore();
}

function base(ctx: Ctx, rx: number) {
  ctx.fillStyle = PALETTE.shadow;
  ctx.beginPath();
  ctx.ellipse(4, 4, rx, rx * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
}

function wallBlock(ctx: Ctx, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = PALETTE.wall;
  ctx.fillRect(x, y - h, w, h);
  ctx.fillStyle = PALETTE.wallShadow;
  ctx.fillRect(x + w * 0.72, y - h, w * 0.28, h);
  // Ameias
  ctx.fillStyle = PALETTE.wall;
  const merlons = Math.max(2, Math.round(w / 11));
  const mw = w / (merlons * 2 - 1);
  for (let i = 0; i < merlons; i++) {
    ctx.fillRect(x + i * mw * 2, y - h - mw * 0.85, mw, mw * 0.9);
  }
}

function tower(ctx: Ctx, x: number, y: number, w: number, h: number, color: string, time: number, flag: boolean) {
  ctx.fillStyle = PALETTE.wall;
  ctx.fillRect(x - w / 2, y - h, w, h);
  ctx.fillStyle = PALETTE.wallShadow;
  ctx.fillRect(x + w * 0.18, y - h, w * 0.32, h);
  ctx.fillStyle = PALETTE.wall;
  ctx.fillRect(x - w * 0.62, y - h - w * 0.22, w * 1.24, w * 0.24);
  // Telhado cônico
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x - w * 0.66, y - h - w * 0.2);
  ctx.lineTo(x, y - h - w * 1.35);
  ctx.lineTo(x + w * 0.66, y - h - w * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.moveTo(x, y - h - w * 1.35);
  ctx.lineTo(x + w * 0.66, y - h - w * 0.2);
  ctx.lineTo(x + w * 0.16, y - h - w * 0.2);
  ctx.closePath();
  ctx.fill();
  if (flag) drawFlag(ctx, x, y - h - w * 1.35, w * 0.5, color, time);
}

/** Bandeira animada (§8/§71). */
export function drawFlag(ctx: Ctx, x: number, y: number, size: number, color: string, time: number) {
  ctx.strokeStyle = PALETTE.woodDark;
  ctx.lineWidth = Math.max(1, size * 0.16);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - size * 2.4);
  ctx.stroke();

  const wave = Math.sin(time * 3 + x * 0.05) * size * 0.25;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - size * 2.4);
  ctx.quadraticCurveTo(x + size * 1.1, y - size * 2.4 + wave, x + size * 2.1, y - size * 2.1);
  ctx.lineTo(x + size * 2.1, y - size * 1.15);
  ctx.quadraticCurveTo(x + size * 1.1, y - size * 1.45 + wave, x, y - size * 1.3);
  ctx.closePath();
  ctx.fill();
}

function drawCastle(ctx: Ctx, level: number, color: string, dark: string, time: number, detail: boolean) {
  const k = 0.85 + level * 0.16;
  base(ctx, 78 * k);

  if (level >= 3) {
    // Muralha externa com portão
    wallBlock(ctx, -72 * k, 0, 58 * k, 26 * k);
    wallBlock(ctx, 16 * k, 0, 58 * k, 26 * k);
    ctx.fillStyle = PALETTE.wallDark;
    ctx.fillRect(-16 * k, -30 * k, 32 * k, 30 * k);
    ctx.fillStyle = '#4a3524';
    ctx.beginPath();
    ctx.moveTo(-10 * k, 0);
    ctx.lineTo(-10 * k, -16 * k);
    ctx.quadraticCurveTo(0, -26 * k, 10 * k, -16 * k);
    ctx.lineTo(10 * k, 0);
    ctx.closePath();
    ctx.fill();
  }

  // Corpo principal
  const bodyW = 62 * k;
  const bodyH = (level >= 4 ? 56 : 44) * k;
  ctx.fillStyle = PALETTE.wall;
  ctx.fillRect(-bodyW / 2, -bodyH - 24 * k, bodyW, bodyH);
  ctx.fillStyle = PALETTE.wallShadow;
  ctx.fillRect(bodyW * 0.16, -bodyH - 24 * k, bodyW * 0.34, bodyH);
  ctx.fillStyle = PALETTE.wall;
  ctx.fillRect(-bodyW * 0.6, -bodyH - 30 * k, bodyW * 1.2, 7 * k);

  // Janelas
  ctx.fillStyle = '#3d5170';
  for (let i = -1; i <= 1; i++) {
    ctx.fillRect(i * 16 * k - 3 * k, -bodyH - 6 * k, 6 * k, 10 * k);
  }

  // Torres laterais conforme o nível
  const towers: number[] = level >= 4 ? [-76, -44, 44, 76] : level >= 3 ? [-52, 52] : level >= 2 ? [-34, 34] : [];
  for (let i = 0; i < towers.length; i++) {
    tower(ctx, towers[i] * k, 0, 22 * k, (level >= 4 ? 64 : 52) * k, color, time, i === 0 || i === towers.length - 1);
  }

  // Torre de menagem
  const keepH = (level >= 5 ? 96 : level >= 4 ? 82 : 66) * k;
  tower(ctx, 0, -bodyH - 24 * k, 30 * k, keepH * 0.55, color, time, true);

  if (level >= 5) {
    ctx.fillStyle = dark;
    ctx.fillRect(-bodyW * 0.6, -bodyH - 34 * k, bodyW * 1.2, 5 * k);
  }

  if (detail) {
    // Estandartes pendurados na muralha
    ctx.fillStyle = color;
    ctx.fillRect(-26 * k, -bodyH - 8 * k, 8 * k, 22 * k);
    ctx.fillRect(18 * k, -bodyH - 8 * k, 8 * k, 22 * k);
  }
}

function drawFort(ctx: Ctx, color: string, dark: string, time: number) {
  base(ctx, 52);
  ctx.fillStyle = PALETTE.woodDark;
  for (let i = -3; i <= 3; i++) {
    const x = i * 14;
    ctx.beginPath();
    ctx.moveTo(x - 5, 0);
    ctx.lineTo(x - 5, -26);
    ctx.lineTo(x, -33);
    ctx.lineTo(x + 5, -26);
    ctx.lineTo(x + 5, 0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = dark;
  ctx.fillRect(-46, -14, 92, 5);
  tower(ctx, 0, -20, 26, 44, color, time, true);
}

function drawTown(ctx: Ctx, color: string, _dark: string, time: number, detail: boolean) {
  base(ctx, 60);
  wallBlock(ctx, -56, 0, 42, 18);
  wallBlock(ctx, 16, 0, 42, 18);
  const roofs = ['#c96a4a', '#d98a4a', '#b8563f'];
  const spots = [
    [-30, -6, 1.1],
    [-8, 0, 1.25],
    [16, -4, 1.05],
    [34, 2, 0.95],
  ];
  spots.forEach((sp, i) => {
    houseAt(ctx, sp[0], sp[1], sp[2], roofs[i % roofs.length]);
  });
  tower(ctx, 2, -10, 22, 42, color, time, true);
  if (detail) {
    ctx.fillStyle = PALETTE.thatch;
    ctx.fillRect(-52, -22, 12, 10);
  }
}

function drawVillage(ctx: Ctx, color: string, detail: boolean) {
  base(ctx, 44);
  houseAt(ctx, -22, 2, 1.1, '#c96a4a');
  houseAt(ctx, 2, -4, 1.25, '#d98a4a');
  houseAt(ctx, 26, 4, 1.0, '#b8563f');
  if (detail) {
    ctx.strokeStyle = PALETTE.woodDark;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-38, 6);
    ctx.lineTo(40, 10);
    ctx.stroke();
  }
  ctx.fillStyle = color;
  ctx.fillRect(-4, -34, 3, 16);
}

function drawRuin(ctx: Ctx) {
  base(ctx, 54);
  ctx.fillStyle = PALETTE.wallDark;
  ctx.fillRect(-46, -30, 16, 30);
  ctx.fillRect(-12, -46, 20, 46);
  ctx.fillRect(24, -20, 14, 20);
  ctx.fillStyle = PALETTE.wallShadow;
  ctx.fillRect(-12, -46, 7, 46);
  ctx.fillStyle = '#6a7382';
  ctx.beginPath();
  ctx.moveTo(-12, -46);
  ctx.lineTo(-2, -52);
  ctx.lineTo(8, -44);
  ctx.lineTo(8, -40);
  ctx.lineTo(-12, -40);
  ctx.closePath();
  ctx.fill();
}

function houseAt(ctx: Ctx, x: number, y: number, s: number, roof: string) {
  const w = 22 * s;
  const h = 16 * s;
  ctx.fillStyle = PALETTE.wall;
  ctx.fillRect(x - w / 2, y - h, w, h);
  ctx.fillStyle = PALETTE.wallShadow;
  ctx.fillRect(x + w * 0.2, y - h, w * 0.3, h);
  ctx.fillStyle = roof;
  ctx.beginPath();
  ctx.moveTo(x - w * 0.64, y - h);
  ctx.lineTo(x, y - h - 11 * s);
  ctx.lineTo(x + w * 0.64, y - h);
  ctx.closePath();
  ctx.fill();
}

/** Emblema simples do reino, usado no mapa e reaproveitável pela UI. */
export function drawEmblem(ctx: Ctx, x: number, y: number, r: number, emblem: Kingdom['emblem'], color: string) {
  ctx.fillStyle = color;
  switch (emblem) {
    case 'fleur':
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.quadraticCurveTo(x + r * 0.5, y - r * 0.2, x, y + r * 0.6);
      ctx.quadraticCurveTo(x - r * 0.5, y - r * 0.2, x, y - r);
      ctx.fill();
      ctx.fillRect(x - r * 0.7, y - r * 0.05, r * 1.4, r * 0.22);
      break;
    case 'swords':
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-r * 0.12, -r, r * 0.24, r * 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillRect(-r * 0.12, -r, r * 0.24, r * 2);
      ctx.restore();
      break;
    case 'tree':
      ctx.beginPath();
      ctx.arc(x, y - r * 0.2, r * 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x - r * 0.12, y - r * 0.2, r * 0.24, r);
      break;
    case 'stag':
      ctx.beginPath();
      ctx.moveTo(x - r * 0.6, y + r * 0.6);
      ctx.lineTo(x - r * 0.2, y - r * 0.6);
      ctx.lineTo(x, y);
      ctx.lineTo(x + r * 0.2, y - r * 0.6);
      ctx.lineTo(x + r * 0.6, y + r * 0.6);
      ctx.lineTo(x, y - r * 0.15);
      ctx.closePath();
      ctx.fill();
      break;
    case 'lion':
      ctx.beginPath();
      ctx.arc(x, y, r * 0.72, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.arc(x, y, r * 0.4, 0, Math.PI * 2);
      ctx.fill();
      break;
    default:
      ctx.beginPath();
      ctx.moveTo(x - r * 0.8, y + r * 0.4);
      ctx.lineTo(x - r * 0.5, y - r * 0.5);
      ctx.lineTo(x, y + r * 0.05);
      ctx.lineTo(x + r * 0.5, y - r * 0.5);
      ctx.lineTo(x + r * 0.8, y + r * 0.4);
      ctx.closePath();
      ctx.fill();
  }
}
