import { CAMERA } from '../../config/balance';
import { UNIT_DEFS } from '../../data/defs';
import type { Army, Battle, GameState, UnitKind, Vec2 } from '../../types';
import { assets } from '../AssetManager';
import { drawFlag } from '../sprites/castle';
import { UNIT_SPRITE } from '../spriteCatalog';
import type { Bounds } from './TerrainLayer';

/**
 * ArmyLayer — exércitos como grupos visíveis (§15) e batalhas no próprio mapa.
 *
 * Não desenhamos 200 soldados: desenhamos o contingente com a bandeira do
 * reino e a contagem. Colunas em marcha mostram a rota, o destino e o
 * suprimento; a batalha acontece sobre o território, sem trocar de tela (§72).
 */
export class ArmyLayer {
  draw(ctx: CanvasRenderingContext2D, state: GameState, bounds: Bounds, zoom: number, time: number) {
    for (const army of Object.values(state.armies)) {
      if (army.state === 'fighting') continue;
      if (!inView(army.position, bounds)) continue;
      this.drawArmy(ctx, state, army, zoom, time);
    }

    for (const battle of Object.values(state.battles)) {
      if (!inView(battle.position, bounds)) continue;
      this.drawBattle(ctx, state, battle, zoom, time);
    }

    if (zoom < CAMERA.lodPeople) return;
    this.drawTrainingCamps(ctx, state, bounds);
  }

  // -- exército -------------------------------------------------------------

  private drawArmy(
    ctx: CanvasRenderingContext2D,
    state: GameState,
    army: Army,
    zoom: number,
    time: number,
  ) {
    const kingdom = state.kingdoms[army.ownerId];
    const total = Object.values(army.units).reduce((a, n) => a + (n ?? 0), 0);
    if (total <= 0) return;

    const marching = army.state !== 'garrison';

    // Rota da coluna: mostra de onde veio e para onde vai.
    if (marching && army.path && army.path.length > 1 && zoom >= CAMERA.lodLabels) {
      ctx.save();
      ctx.strokeStyle = hexA(kingdom?.color ?? '#8b95a2', 0.55);
      ctx.lineWidth = 3.5 / zoom;
      ctx.setLineDash([14 / zoom, 10 / zoom]);
      ctx.lineDashOffset = -time * 26;
      ctx.beginPath();
      ctx.moveTo(army.path[0].x, army.path[0].y);
      for (let i = 1; i < army.path.length; i++) ctx.lineTo(army.path[i].x, army.path[i].y);
      ctx.stroke();
      ctx.restore();

      const end = army.path[army.path.length - 1];
      drawTargetMark(ctx, end, kingdom?.color ?? '#8b95a2', zoom, time);
    }

    let lead: UnitKind = 'militia';
    let leadCount = -1;
    for (const [kind, count] of Object.entries(army.units)) {
      if ((count ?? 0) > leadCount) {
        leadCount = count ?? 0;
        lead = kind as UnitKind;
      }
    }

    const p = army.position;
    const bob = marching ? Math.sin(time * 6 + p.x * 0.02) * 1.6 : 0;
    const scale = zoom >= CAMERA.lodPeople ? 0.34 : 0.24;
    assets.drawShadow(ctx, p.x, p.y + 2, 34 * scale * 2.2);
    const isPlayer = kingdom?.ownerKind === 'PLAYER';
    const drew = assets.draw(ctx, UNIT_SPRITE[lead], p.x, p.y + bob, scale, {
      tint: isPlayer ? undefined : kingdom?.color,
      tintAlpha: 0.3,
    });
    if (!drew) drawTroopFallback(ctx, p, kingdom?.color ?? '#8b95a2', time);

    if (zoom < CAMERA.lodLabels) return;

    drawFlag(ctx, p.x - 46, p.y - 6, 9, kingdom?.color ?? '#8b95a2', time);

    const label = `${total}`;
    ctx.font = '700 12px "Inter", system-ui, sans-serif';
    const w = Math.max(30, ctx.measureText(label).width + 20);
    ctx.fillStyle = 'rgba(10,16,26,0.86)';
    ctx.beginPath();
    ctx.roundRect(p.x - w / 2, p.y + 6, w, 19, 6);
    ctx.fill();
    ctx.strokeStyle = kingdom?.color ?? 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = '#eef4fb';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, p.x, p.y + 16);

    // Aviso de suprimento acabando — a logística tem que ser visível (§16).
    if (marching && army.supplies <= 0) {
      ctx.fillStyle = `rgba(240,97,106,${0.55 + Math.sin(time * 4) * 0.35})`;
      ctx.beginPath();
      ctx.arc(p.x + w / 2 + 8, p.y + 15, 4.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // -- batalha --------------------------------------------------------------

  private drawBattle(
    ctx: CanvasRenderingContext2D,
    state: GameState,
    battle: Battle,
    zoom: number,
    time: number,
  ) {
    const { x, y } = battle.position;
    const attackerColor = battle.attacker.kingdomId
      ? (state.kingdoms[battle.attacker.kingdomId]?.color ?? '#d8453f')
      : '#d8453f';
    const defenderColor = battle.defender.kingdomId
      ? (state.kingdoms[battle.defender.kingdomId]?.color ?? '#b9c2cd')
      : '#b9c2cd';

    // Halo pulsando marca o campo de batalha mesmo com o zoom afastado.
    const pulse = 0.35 + Math.sin(time * 3.4) * 0.18;
    ctx.fillStyle = `rgba(214,74,60,${pulse * 0.5})`;
    ctx.beginPath();
    ctx.ellipse(x, y + 30, 190, 78, 0, 0, Math.PI * 2);
    ctx.fill();

    const attackerN = count(battle.attacker.units);
    const defenderN = count(battle.defender.units);

    if (zoom >= CAMERA.lodProps) {
      const clash = Math.sin(time * 7) * 7;
      drawSide(ctx, { x: x - 120 + clash, y: y + 40 }, attackerColor, attackerN, time, false);
      drawSide(ctx, { x: x + 120 - clash, y: y + 40 }, defenderColor, defenderN, time + 1.3, true);
      drawDust(ctx, x, y + 34, time);
    }

    if (zoom < CAMERA.lodLabels) return;

    // Painel flutuante: números da batalha em tempo real.
    const w = 214;
    const h = battle.defender.maxWallHp > 0 ? 60 : 48;
    const bx = x - w / 2;
    const by = y - 116;

    ctx.fillStyle = 'rgba(9,14,24,0.9)';
    ctx.beginPath();
    ctx.roundRect(bx, by, w, h, 9);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.textBaseline = 'middle';
    ctx.font = '700 11px "Inter", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = attackerColor;
    ctx.fillText(`${attackerN}`, bx + 12, by + 15);
    ctx.textAlign = 'right';
    ctx.fillStyle = defenderColor;
    ctx.fillText(`${defenderN}`, bx + w - 12, by + 15);
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(238,244,251,0.75)';
    ctx.font = '600 10px "Inter", system-ui, sans-serif';
    ctx.fillText(`RODADA ${battle.round}`, x, by + 15);

    // Barras de moral, lado a lado.
    moraleBar(ctx, bx + 12, by + 26, 88, battle.attacker.morale, attackerColor);
    moraleBar(ctx, bx + w - 100, by + 26, 88, battle.defender.morale, defenderColor);

    if (battle.defender.maxWallHp > 0) {
      const ratio = battle.defender.wallHp / battle.defender.maxWallHp;
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.beginPath();
      ctx.roundRect(bx + 12, by + 42, w - 24, 6, 3);
      ctx.fill();
      ctx.fillStyle = ratio > 0 ? '#c9cfd8' : '#6b7280';
      ctx.beginPath();
      ctx.roundRect(bx + 12, by + 42, (w - 24) * Math.max(0, ratio), 6, 3);
      ctx.fill();
      ctx.fillStyle = 'rgba(238,244,251,0.6)';
      ctx.font = '600 8.5px "Inter", system-ui, sans-serif';
      ctx.fillText(ratio > 0 ? 'MURALHA' : 'MURALHA ROMPIDA', x, by + 54);
    }
  }

  private drawTrainingCamps(ctx: CanvasRenderingContext2D, state: GameState, bounds: Bounds) {
    for (const order of state.training) {
      const t = state.territories[order.territoryId];
      if (!t) continue;
      const castle = t.castleId ? state.castles[t.castleId] : null;
      const anchor = castle?.position ?? t.center;
      const x = anchor.x + 120;
      const y = anchor.y + 108;
      if (!inView({ x, y }, bounds)) continue;
      const progress = 1 - order.remaining / Math.max(1, order.total);
      const kingdom = t.ownerId ? state.kingdoms[t.ownerId] : null;

      if (!assets.draw(ctx, 'props/tent', x, y, 0.3)) {
        ctx.fillStyle = kingdom?.color ?? '#8b95a2';
        ctx.beginPath();
        ctx.moveTo(x - 18, y);
        ctx.lineTo(x, y - 26);
        ctx.lineTo(x + 18, y);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(10,16,26,0.8)';
      ctx.beginPath();
      ctx.roundRect(x - 26, y + 6, 52, 8, 4);
      ctx.fill();
      ctx.fillStyle = '#4bd07f';
      ctx.beginPath();
      ctx.roundRect(x - 24, y + 8, 48 * progress, 4, 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(238,244,251,0.85)';
      ctx.font = '600 10px "Inter", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(UNIT_DEFS[order.unit].name.toUpperCase(), x, y + 26);
    }
  }
}

// ---------------------------------------------------------------------------

function count(units: Partial<Record<UnitKind, number>>): number {
  return Object.values(units).reduce((a: number, n) => a + (n ?? 0), 0);
}

function inView(p: Vec2, b: Bounds): boolean {
  return p.x > b.minX && p.x < b.maxX && p.y > b.minY && p.y < b.maxY;
}

function moraleBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  morale: number,
  color: string,
) {
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, 6, 3);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, (w * Math.max(0, Math.min(100, morale))) / 100, 6, 3);
  ctx.fill();
}

function drawTargetMark(
  ctx: CanvasRenderingContext2D,
  p: Vec2,
  color: string,
  zoom: number,
  time: number,
) {
  const r = 26 + Math.sin(time * 3) * 4;
  ctx.save();
  ctx.strokeStyle = hexA(color, 0.85);
  ctx.lineWidth = 3 / zoom + 1;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, r * 1.4, r * 0.6, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(p.x - 9, p.y - 9);
  ctx.lineTo(p.x + 9, p.y + 9);
  ctx.moveTo(p.x + 9, p.y - 9);
  ctx.lineTo(p.x - 9, p.y + 9);
  ctx.stroke();
  ctx.restore();
}

/** Pequeno bloco de soldados que se agita durante a batalha. */
function drawSide(
  ctx: CanvasRenderingContext2D,
  p: Vec2,
  color: string,
  size: number,
  time: number,
  facingLeft: boolean,
) {
  const rows = Math.min(3, Math.max(1, Math.ceil(size / 12)));
  const cols = Math.min(4, Math.max(1, Math.ceil(size / 6)));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ox = (c - (cols - 1) / 2) * 15 * (facingLeft ? -1 : 1);
      const oy = r * 11;
      const jitter = Math.sin(time * 8 + r * 2 + c) * 1.8;
      ctx.fillStyle = 'rgba(18,30,46,0.22)';
      ctx.beginPath();
      ctx.ellipse(p.x + ox, p.y + oy + 1, 6, 2.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.fillRect(p.x + ox - 3.6, p.y + oy - 15 + jitter, 7.2, 12);
      ctx.fillStyle = '#e8c39a';
      ctx.beginPath();
      ctx.arc(p.x + ox, p.y + oy - 18 + jitter, 3.6, 0, Math.PI * 2);
      ctx.fill();
      // Lâmina batendo
      ctx.strokeStyle = '#cdd4de';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      const swing = Math.sin(time * 9 + c) * 6;
      ctx.moveTo(p.x + ox + (facingLeft ? -6 : 6), p.y + oy - 12 + jitter);
      ctx.lineTo(p.x + ox + (facingLeft ? -14 : 14), p.y + oy - 22 + swing + jitter);
      ctx.stroke();
    }
  }
}

function drawDust(ctx: CanvasRenderingContext2D, x: number, y: number, time: number) {
  for (let i = 0; i < 6; i++) {
    const t = (time * 0.5 + i * 0.17) % 1;
    const alpha = (1 - t) * 0.22;
    ctx.fillStyle = `rgba(216,203,178,${alpha})`;
    ctx.beginPath();
    ctx.arc(
      x + Math.sin(i * 2.1 + time) * 46,
      y - t * 40,
      12 + t * 22,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
}

function drawTroopFallback(ctx: CanvasRenderingContext2D, p: Vec2, color: string, time: number) {
  for (let i = 0; i < 5; i++) {
    const ox = (i % 3) * 13 - 13;
    const oy = Math.floor(i / 3) * 9;
    const bob = Math.sin(time * 2 + i) * 0.8;
    ctx.fillStyle = color;
    ctx.fillRect(p.x + ox - 3.5, p.y + oy - 15 + bob, 7, 12);
    ctx.fillStyle = '#e8c39a';
    ctx.beginPath();
    ctx.arc(p.x + ox, p.y + oy - 18 + bob, 3.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function hexA(hex: string, a: number) {
  const h = hex.replace('#', '');
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(
    h.slice(4, 6),
    16,
  )},${a})`;
}
