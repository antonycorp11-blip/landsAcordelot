import { spriteUrl } from '../game/config/version';
import type { Game } from '../game/Game';
import type { DecisionOption } from '../game/data/defs';
import { GENERALS, GOVERNORS } from '../game/managers/RealmManager';

/** Rótulos curtos: o jogador precisa ver o preço antes de escolher. */
const LABELS: Record<string, string> = {
  coin: 'moedas',
  food: 'comida',
  happiness: 'contentamento',
  stability: 'ordem',
  loyalty: 'lealdade',
  morale: 'moral',
  renown: 'renome',
};

function cost(effects: DecisionOption['effects']) {
  const out: { text: string; up: boolean }[] = [];
  for (const [key, label] of Object.entries(LABELS)) {
    const v = effects[key as keyof typeof effects] as number | undefined;
    if (!v) continue;
    out.push({ text: `${v > 0 ? '+' : ''}${v} ${label}`, up: v > 0 });
  }
  if (effects.units) {
    const n = Object.values(effects.units).reduce((a, b) => a + b, 0);
    out.push({ text: `+${n} tropa`, up: true });
  }
  return out;
}

/**
 * Demanda do conselho.
 *
 * O governador ou o general aparece com um problema que não se resolve
 * sozinho. As duas saídas custam alguma coisa — ouro, humor do povo ou moral
 * da tropa. É de propósito: governar é escolher o que se perde.
 */
export function CouncilDemand({ game }: { game: Game }) {
  const decision = game.council.pending;
  if (!decision) return null;

  const fromGovernor = decision.from === 'governor';
  const list = fromGovernor ? GOVERNORS : GENERALS;
  const seatId = fromGovernor ? game.state.governorId : game.state.generalId;
  const advisor = list.find((a) => a.id === seatId) ?? list[0];

  return (
    <div className="promo">
      <div className="promo-veil" />
      <div className="promo-card">
        <div className="promo-chapter">
          {fromGovernor ? 'O governador pede audiência' : 'O general pede audiência'}
        </div>
        <h2>{decision.title}</h2>

        <div className="council-who">
          <img src={spriteUrl(advisor.card)} alt="" />
          <div className="cw-text">
            <div className="ad-head">
              <span className="ad-name">{advisor.name}</span>
              <span className="ad-title">{advisor.title}</span>
            </div>
            <p className="ad-history">{decision.text}</p>
          </div>
        </div>

        <div className="council-opts">
          {decision.options.map((option, i) => (
            <button key={option.label} className="council-opt" onClick={() => game.decide(i)}>
              <span className="ol">{option.label}</span>
              <span className="oc">
                {cost(option.effects).map((c) => (
                  <span key={c.text} className={c.up ? 'up' : 'down'}>
                    {c.text}
                  </span>
                ))}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
