import { PALETTE } from '../../config/palette';

type Ctx = CanvasRenderingContext2D;

function shadow(ctx: Ctx, x: number, y: number, rx: number, ry: number) {
  ctx.fillStyle = PALETTE.shadow;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

export function drawTreeRound(ctx: Ctx, x: number, y: number, s: number) {
  const h = 26 * s;
  shadow(ctx, x + 2 * s, y + 2 * s, 9 * s, 4 * s);
  ctx.fillStyle = PALETTE.woodDark;
  ctx.fillRect(x - 1.6 * s, y - h * 0.35, 3.2 * s, h * 0.38);
  ctx.fillStyle = '#3f8f47';
  ctx.beginPath();
  ctx.ellipse(x, y - h * 0.55, 10.5 * s, 9.5 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#57ab5b';
  ctx.beginPath();
  ctx.ellipse(x - 2.6 * s, y - h * 0.66, 7 * s, 6.2 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#7cc86f';
  ctx.beginPath();
  ctx.ellipse(x - 3.8 * s, y - h * 0.76, 3.4 * s, 2.9 * s, 0, 0, Math.PI * 2);
  ctx.fill();
}

export function drawTreePine(ctx: Ctx, x: number, y: number, s: number) {
  const h = 34 * s;
  shadow(ctx, x + 2 * s, y + 2 * s, 8 * s, 3.6 * s);
  ctx.fillStyle = PALETTE.woodDark;
  ctx.fillRect(x - 1.5 * s, y - h * 0.22, 3 * s, h * 0.24);
  const tiers = [
    { w: 9.5, y: 0.22, c: '#2f7038' },
    { w: 7.8, y: 0.48, c: '#3a8443' },
    { w: 5.6, y: 0.72, c: '#48994e' },
  ];
  for (const t of tiers) {
    ctx.fillStyle = t.c;
    ctx.beginPath();
    ctx.moveTo(x, y - h * (t.y + 0.3));
    ctx.lineTo(x - t.w * s, y - h * t.y);
    ctx.lineTo(x + t.w * s, y - h * t.y);
    ctx.closePath();
    ctx.fill();
  }
}

export function drawRock(ctx: Ctx, x: number, y: number, s: number) {
  shadow(ctx, x + 1.5 * s, y + 1.5 * s, 8 * s, 3 * s);
  ctx.fillStyle = PALETTE.rockDark;
  ctx.beginPath();
  ctx.moveTo(x - 8 * s, y);
  ctx.lineTo(x - 4 * s, y - 8 * s);
  ctx.lineTo(x + 2 * s, y - 9.5 * s);
  ctx.lineTo(x + 8 * s, y - 2 * s);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = PALETTE.rock;
  ctx.beginPath();
  ctx.moveTo(x - 4 * s, y - 8 * s);
  ctx.lineTo(x + 2 * s, y - 9.5 * s);
  ctx.lineTo(x + 1 * s, y - 3 * s);
  ctx.closePath();
  ctx.fill();
}

export function drawPeak(ctx: Ctx, x: number, y: number, s: number) {
  const h = 62 * s;
  const w = 40 * s;
  shadow(ctx, x + 4 * s, y + 3 * s, w * 0.55, 8 * s);
  ctx.fillStyle = PALETTE.rockDark;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y);
  ctx.lineTo(x - w * 0.08, y - h);
  ctx.lineTo(x + w * 0.5, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = PALETTE.rock;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y);
  ctx.lineTo(x - w * 0.08, y - h);
  ctx.lineTo(x + w * 0.06, y - h * 0.62);
  ctx.lineTo(x - w * 0.16, y);
  ctx.closePath();
  ctx.fill();
  // Neve no topo
  ctx.fillStyle = PALETTE.snow;
  ctx.beginPath();
  ctx.moveTo(x - w * 0.08, y - h);
  ctx.lineTo(x - w * 0.2, y - h * 0.66);
  ctx.lineTo(x - w * 0.09, y - h * 0.72);
  ctx.lineTo(x + w * 0.02, y - h * 0.62);
  ctx.lineTo(x + w * 0.1, y - h * 0.7);
  ctx.closePath();
  ctx.fill();
}

export function drawField(ctx: Ctx, x: number, y: number, s: number, phase: number) {
  const w = 52 * s;
  const h = 30 * s;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((phase - 0.5) * 0.35);
  // Talhão em losango, no mesmo eixo isométrico do resto do mundo.
  ctx.fillStyle = "#8a6d2f";
  ctx.beginPath();
  ctx.moveTo(-w / 2, 2 * s);
  ctx.lineTo(0, -h / 2 + 2 * s);
  ctx.lineTo(w / 2, 2 * s);
  ctx.lineTo(0, h / 2 + 2 * s);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#e3c258";
  ctx.beginPath();
  ctx.moveTo(-w / 2, 0);
  ctx.lineTo(0, -h / 2);
  ctx.lineTo(w / 2, 0);
  ctx.lineTo(0, h / 2);
  ctx.closePath();
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = "#c9a63f";
  ctx.lineWidth = 2.2 * s;
  for (let i = -4; i <= 4; i++) {
    const off = (i * w) / 9;
    ctx.beginPath();
    ctx.moveTo(off - w / 2, -h);
    ctx.lineTo(off + w / 2, h);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = "#a8832c";
  ctx.lineWidth = 1.6 * s;
  ctx.beginPath();
  ctx.moveTo(-w / 2, 0);
  ctx.lineTo(0, -h / 2);
  ctx.lineTo(w / 2, 0);
  ctx.lineTo(0, h / 2);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

export function drawHouse(ctx: Ctx, x: number, y: number, s: number, roof = PALETTE.roof) {
  const w = 20 * s;
  const h = 13 * s;
  shadow(ctx, x + 3 * s, y + 1.5 * s, w * 0.62, 4 * s);
  ctx.fillStyle = PALETTE.wall;
  ctx.fillRect(x - w / 2, y - h, w, h);
  ctx.fillStyle = PALETTE.wallShadow;
  ctx.fillRect(x + w / 2 - w * 0.22, y - h, w * 0.22, h);
  ctx.fillStyle = roof;
  ctx.beginPath();
  ctx.moveTo(x - w * 0.62, y - h);
  ctx.lineTo(x, y - h - 10 * s);
  ctx.lineTo(x + w * 0.62, y - h);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = PALETTE.roofDark;
  ctx.beginPath();
  ctx.moveTo(x, y - h - 10 * s);
  ctx.lineTo(x + w * 0.62, y - h);
  ctx.lineTo(x + w * 0.28, y - h);
  ctx.closePath();
  ctx.fill();
}

export function drawMine(ctx: Ctx, x: number, y: number, s: number, gold: boolean) {
  shadow(ctx, x + 2 * s, y + 2 * s, 16 * s, 5 * s);
  ctx.fillStyle = PALETTE.rockDark;
  ctx.beginPath();
  ctx.moveTo(x - 18 * s, y);
  ctx.lineTo(x - 10 * s, y - 16 * s);
  ctx.lineTo(x + 10 * s, y - 16 * s);
  ctx.lineTo(x + 18 * s, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#2b2f36';
  ctx.beginPath();
  ctx.moveTo(x - 7 * s, y);
  ctx.lineTo(x - 7 * s, y - 8 * s);
  ctx.quadraticCurveTo(x, y - 15 * s, x + 7 * s, y - 8 * s);
  ctx.lineTo(x + 7 * s, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = PALETTE.wood;
  ctx.fillRect(x - 9 * s, y - 10 * s, 2.4 * s, 10 * s);
  ctx.fillRect(x + 6.6 * s, y - 10 * s, 2.4 * s, 10 * s);
  ctx.fillRect(x - 10 * s, y - 12 * s, 20 * s, 2.6 * s);
  if (gold) {
    ctx.fillStyle = PALETTE.gold;
    ctx.beginPath();
    ctx.arc(x + 12 * s, y - 3 * s, 3 * s, 0, Math.PI * 2);
    ctx.arc(x + 16 * s, y - 1.5 * s, 2.2 * s, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawQuarry(ctx: Ctx, x: number, y: number, s: number) {
  shadow(ctx, x, y + 2 * s, 18 * s, 6 * s);
  ctx.fillStyle = '#b9b3a6';
  ctx.beginPath();
  ctx.ellipse(x, y - 2 * s, 18 * s, 9 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#8f887b';
  ctx.beginPath();
  ctx.ellipse(x, y - 3 * s, 11 * s, 5 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.wall;
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(x - 14 * s + i * 10 * s, y - 9 * s - i * 1.4 * s, 7 * s, 5 * s);
  }
}

export function drawShrine(ctx: Ctx, x: number, y: number, s: number) {
  shadow(ctx, x + 2 * s, y + 1.5 * s, 12 * s, 4 * s);
  ctx.fillStyle = PALETTE.wall;
  ctx.fillRect(x - 9 * s, y - 20 * s, 18 * s, 20 * s);
  ctx.fillStyle = PALETTE.wallShadow;
  ctx.fillRect(x + 4 * s, y - 20 * s, 5 * s, 20 * s);
  ctx.fillStyle = '#6b8fd6';
  ctx.beginPath();
  ctx.moveTo(x - 11 * s, y - 20 * s);
  ctx.lineTo(x, y - 32 * s);
  ctx.lineTo(x + 11 * s, y - 20 * s);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = PALETTE.gold;
  ctx.fillRect(x - 1.2 * s, y - 39 * s, 2.4 * s, 8 * s);
  ctx.fillRect(x - 4 * s, y - 36 * s, 8 * s, 2.2 * s);
}

export function drawDock(ctx: Ctx, x: number, y: number, s: number) {
  ctx.fillStyle = PALETTE.woodDark;
  ctx.fillRect(x - 22 * s, y - 3 * s, 44 * s, 5 * s);
  for (let i = -2; i <= 2; i++) ctx.fillRect(x + i * 9 * s - 1.2 * s, y + 1 * s, 2.4 * s, 8 * s);
  ctx.fillStyle = PALETTE.wood;
  ctx.fillRect(x - 22 * s, y - 4.5 * s, 44 * s, 2 * s);
}

/** Moinho com pás girando — parte do "mapa vivo" (§8). */
export function drawWindmill(ctx: Ctx, x: number, y: number, s: number, angle: number) {
  shadow(ctx, x + 3 * s, y + 1.5 * s, 12 * s, 4 * s);
  ctx.fillStyle = PALETTE.wall;
  ctx.beginPath();
  ctx.moveTo(x - 9 * s, y);
  ctx.lineTo(x - 6 * s, y - 26 * s);
  ctx.lineTo(x + 6 * s, y - 26 * s);
  ctx.lineTo(x + 9 * s, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = PALETTE.wallShadow;
  ctx.beginPath();
  ctx.moveTo(x + 2 * s, y);
  ctx.lineTo(x + 2 * s, y - 26 * s);
  ctx.lineTo(x + 6 * s, y - 26 * s);
  ctx.lineTo(x + 9 * s, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = PALETTE.roof;
  ctx.beginPath();
  ctx.moveTo(x - 8 * s, y - 26 * s);
  ctx.lineTo(x, y - 34 * s);
  ctx.lineTo(x + 8 * s, y - 26 * s);
  ctx.closePath();
  ctx.fill();

  ctx.save();
  ctx.translate(x, y - 26 * s);
  ctx.rotate(angle);
  ctx.fillStyle = '#f0e6d2';
  ctx.strokeStyle = PALETTE.woodDark;
  ctx.lineWidth = 1.2 * s;
  for (let i = 0; i < 4; i++) {
    ctx.rotate(Math.PI / 2);
    ctx.beginPath();
    ctx.rect(1.4 * s, -2.4 * s, 16 * s, 4.8 * s);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}
