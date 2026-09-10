import { useEffect, useState } from 'react';
import { TUTORIAL_STEPS } from '../game/data/defs';
import type { Game } from '../game/Game';
import type { GameState } from '../game/types';

interface Spot {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}

/**
 * Holofote sobre o alvo do passo atual.
 *
 * Fica preso ao elemento de verdade: o painel abre, a câmera anda, e o anel
 * acompanha. Sem isto, o tutorial diz o que fazer mas não onde — e é o "onde"
 * que trava quem está começando.
 */
function useSpot(game: Game, step: (typeof TUTORIAL_STEPS)[number] | undefined): Spot | null {
  const [spot, setSpot] = useState<Spot | null>(null);

  useEffect(() => {
    const target = step?.target;
    if (!target) {
      setSpot(null);
      return;
    }
    let raf = 0;
    const follow = () => {
      raf = requestAnimationFrame(follow);
      if (target.kind === 'selector') {
        const el = document.querySelector(`[data-tut="${target.value}"]`);
        if (!el) {
          setSpot((s) => (s === null ? s : null));
          return;
        }
        const r = el.getBoundingClientRect();
        setSpot((s) =>
          s && s.x === r.left && s.y === r.top && s.w === r.width
            ? s
            : { x: r.left, y: r.top, w: r.width, h: r.height, label: target.label },
        );
        return;
      }
      const p = game.tutorialPoint(target.value);
      if (!p) {
        setSpot((s) => (s === null ? s : null));
        return;
      }
      const size = 96;
      setSpot((s) =>
        s && Math.abs(s.x - (p.x - size / 2)) < 0.5 && Math.abs(s.y - (p.y - size / 2)) < 0.5
          ? s
          : { x: p.x - size / 2, y: p.y - size / 2, w: size, h: size, label: target.label },
      );
    };
    raf = requestAnimationFrame(follow);
    return () => cancelAnimationFrame(raf);
  }, [game, step]);

  return spot;
}

/**
 * Tutorial guiado por estado real do jogo (§69).
 * Cada passo só avança quando o jogador realmente fez a coisa — nunca por
 * clique em "próximo".
 */
export function Tutorial({ game, state }: { game: Game; state: GameState }) {
  const step = state.tutorialDone ? undefined : TUTORIAL_STEPS[state.tutorialStep];
  const spot = useSpot(game, step);
  if (!step) return null;

  return (
    <>
      {spot && (
        <div
          className="tut-spot"
          style={{ left: spot.x - 8, top: spot.y - 8, width: spot.w + 16, height: spot.h + 16 }}
        >
          <span className="tut-tag">{spot.label}</span>
        </div>
      )}

      <div className="tutorial">
        <div className="step">
          Passo {state.tutorialStep + 1} de {TUTORIAL_STEPS.length}
        </div>
        <div className="title">{step.title}</div>
        <div className="text">{step.text}</div>
        <div className="tip">▸ {step.hint}</div>
        <div className="dots">
          {TUTORIAL_STEPS.map((s, i) => (
            <i key={s.id} className={i <= state.tutorialStep ? 'done' : ''} />
          ))}
        </div>
        <button className="skip" onClick={() => game.skipTutorial()}>
          pular tutorial
        </button>
      </div>
    </>
  );
}
