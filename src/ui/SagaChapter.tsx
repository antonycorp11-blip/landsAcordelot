import { assetUrl } from '../game/config/version';
import type { Game } from '../game/Game';
import { SAGA, sagaChapter } from '../game/data/saga';

/**
 * Um capítulo de "O Acordo Quebrado".
 *
 * Chega quando uma casa cai ou quando passa a confiar em você — e o texto
 * muda conforme o caminho. A mesma verdade lida sobre uma arca tomada à força
 * não é a mesma cena que a ouvida de quem a guardou por quarenta anos.
 */
export function SagaChapter({ game }: { game: Game }) {
  const id = game.state.sagaPending;
  const chapter = id ? sagaChapter(id) : null;
  if (!chapter) return null;
  const via = game.state.saga[chapter.id] ?? 'conquest';
  const lines = via === 'friendship' ? chapter.friendship : chapter.conquest;

  return (
    <div className="promo saga">
      <img className="promo-art" src={assetUrl('/brand/keyart.webp')} alt="" />
      <div className="promo-veil" />
      <div className="promo-card">
        <div className="promo-chapter">
          {SAGA.title} · {chapter.chapter}
        </div>
        <h2>{chapter.title}</h2>
        <span className={`saga-via ${via}`}>
          {via === 'friendship' ? 'Contado por quem guardava' : 'Tomado à força'}
        </span>
        {lines.map((line, i) => (
          <p key={i}>{line}</p>
        ))}
        <p className="promo-closing">{chapter.closing}</p>
        <button className="btn primary wide" onClick={() => game.closeSaga()}>
          Continuar
        </button>
      </div>
    </div>
  );
}
