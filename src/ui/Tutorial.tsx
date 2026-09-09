import { TUTORIAL_STEPS } from '../game/data/defs';
import type { Game } from '../game/Game';
import type { GameState } from '../game/types';

/**
 * Tutorial guiado por estado real do jogo (§69).
 * Cada passo só avança quando o jogador realmente fez a coisa — nunca por
 * clique em "próximo".
 */
export function Tutorial({ game, state }: { game: Game; state: GameState }) {
  if (state.tutorialDone) return null;
  const step = TUTORIAL_STEPS[state.tutorialStep];
  if (!step) return null;

  return (
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
  );
}
