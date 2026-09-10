import { useEffect, useRef, useState } from 'react';
import type { Game } from '../game/Game';

const W = 176;
const H = 108;

const LAYERS: { id: 'provinces' | 'resources' | 'routes' | 'armies'; label: string; color: string }[] = [
  { id: 'provinces', label: 'Províncias', color: '#4b8ef2' },
  { id: 'resources', label: 'Recursos', color: '#5cd08a' },
  { id: 'routes', label: 'Rotas', color: '#e8c35a' },
  { id: 'armies', label: 'Exércitos', color: '#f0616a' },
];

/**
 * Minimapa com as camadas do conceito. As caixas não são enfeite: cada uma
 * liga e desliga de verdade uma camada do renderer.
 */
export function Minimap({ game, version }: { game: Game; version: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [, force] = useState(0);
  const layers = game.mapLayers();

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
      ctx.fillStyle = '#0d2237';
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
        ctx.fillStyle = k ? k.color : '#6f7f52';
        ctx.globalAlpha = k ? 0.92 : 0.5;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(232,195,90,.3)';
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }

      // Colunas em campo: onde a guerra está acontecendo agora.
      for (const army of Object.values(game.state.armies)) {
        if (army.state === 'garrison') continue;
        const k = game.state.kingdoms[army.ownerId];
        ctx.fillStyle = k?.color ?? '#fff';
        ctx.beginPath();
        ctx.arc(army.position.x * sx, army.position.y * sy, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const b of Object.values(game.state.battles)) {
        ctx.strokeStyle = `rgba(240,97,106,${0.5 + Math.sin(Date.now() / 220) * 0.4})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(b.position.x * sx, b.position.y * sy, 4, 0, Math.PI * 2);
        ctx.stroke();
      }

      const b = game.camera.visibleBounds(0);
      ctx.strokeStyle = 'rgba(255,255,255,.95)';
      ctx.lineWidth = 1.3;
      ctx.strokeRect(b.minX * sx, b.minY * sy, (b.maxX - b.minX) * sx, (b.maxY - b.minY) * sy);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [game, version]);

  return (
    <div className="minimap">
      <div className="minimap-row">
        <div className="minimap-canvas">
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
        </div>
        <div className="layers">
          <div className="layers-cap">Camadas</div>
          {LAYERS.map((l) => (
            <button
              key={l.id}
              className={`layer ${layers[l.id] ? 'on' : ''}`}
              onClick={() => {
                game.toggleLayer(l.id);
                force((v) => v + 1);
              }}
            >
              <i style={{ background: l.color }} />
              <span>{l.label}</span>
              <em>{layers[l.id] ? '✓' : ''}</em>
            </button>
          ))}
        </div>
      </div>
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
