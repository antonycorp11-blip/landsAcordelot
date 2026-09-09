import { useEffect, useRef } from 'react';
import type { Game } from '../game/Game';

const W = 156;
const H = 92;

/** Minimapa funcional: desenha os territórios reais e move a câmera ao clique. */
export function Minimap({ game, version }: { game: Game; version: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    let raf = 0;

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const sx = W / game.world.width;
      const sy = H / game.world.height;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#183a5c';
      ctx.fillRect(0, 0, W, H);

      for (const t of Object.values(game.state.territories)) {
        if (t.polygon.length < 3) continue;
        const k = t.ownerId ? game.state.kingdoms[t.ownerId] : null;
        ctx.beginPath();
        ctx.moveTo(t.polygon[0].x * sx, t.polygon[0].y * sy);
        for (let i = 1; i < t.polygon.length; i++) {
          ctx.lineTo(t.polygon[i].x * sx, t.polygon[i].y * sy);
        }
        ctx.closePath();
        ctx.fillStyle = k ? k.color : '#7c8a52';
        ctx.globalAlpha = k ? 0.9 : 0.55;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(255,255,255,.35)';
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }

      const b = game.camera.visibleBounds(0);
      ctx.strokeStyle = 'rgba(255,255,255,.9)';
      ctx.lineWidth = 1.4;
      ctx.strokeRect(b.minX * sx, b.minY * sy, (b.maxX - b.minX) * sx, (b.maxY - b.minY) * sy);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [game, version]);

  return (
    <div className="minimap">
      <canvas
        ref={ref}
        style={{ width: W, height: H }}
        onPointerDown={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          game.camera.focus({
            x: ((e.clientX - r.left) / r.width) * game.world.width,
            y: ((e.clientY - r.top) / r.height) * game.world.height,
          });
        }}
      />
      <div className="zoomrow">
        <button onClick={() => game.zoomBy(1 / 1.25)} title="Afastar">
          −
        </button>
        <button
          onClick={() => {
            const c = game.playerCapital();
            if (c) game.focusTerritory(c.id, 0.95);
          }}
          title="Voltar à capital"
        >
          ⌂
        </button>
        <button onClick={() => game.zoomBy(1.25)} title="Aproximar">
          +
        </button>
      </div>
    </div>
  );
}
