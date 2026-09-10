import type { Game } from '../game/Game';
import { DiplomacyManager } from '../game/managers/DiplomacyManager';
import type { GameState } from '../game/types';

/** Barra de simpatia: vermelho à esquerda, ouro à direita, zero no meio. */
function Attitude({ value }: { value: number }) {
  const pct = (value + 100) / 2;
  return (
    <div className="dip-mood">
      <div className="dip-bar">
        <i style={{ left: `${Math.max(0, Math.min(100, pct))}%` }} />
      </div>
      <span className={value < -20 ? 'bad' : value > 20 ? 'good' : ''}>{Math.round(value)}</span>
    </div>
  );
}

/**
 * A mesa do País (§17).
 *
 * Cada vizinho é uma linha: quem é, o que pensa de você, o que está assinado
 * e o que dá para propor. As propostas trancadas continuam à vista, com o
 * motivo — saber o que falta é metade da decisão.
 */
export function DiplomacyPanel({
  game,
  state,
  onClose,
}: {
  game: Game;
  state: GameState;
  onClose: () => void;
}) {
  const foreign = game.diplomacy.foreignKingdoms();

  return (
    <div className="panel left dip-panel">
      <div className="panel-head">
        <div className="grow">
          <div className="title">Diplomacia</div>
          <div className="sub">
            {foreign.length === 0
              ? 'Nenhum vizinho de pé'
              : `${foreign.length} ${foreign.length === 1 ? 'vizinho' : 'vizinhos'} na mesa`}
          </div>
        </div>
        <button className="close" onClick={onClose}>
          ×
        </button>
      </div>

      <div className="panel-body">
        <div className="dip-country">
          <div className="dip-country-copy">
            <span className="eyebrow">FRONTEIRAS DO PAÍS</span>
            <strong>{Object.keys(state.territories).length} províncias reveladas</strong>
            <small>
              {foreign.length > 0
                ? `${foreign.map((k) => k.name).join(' · ')} aguardam além de Valdória.`
                : 'Todo o território conhecido está sob sua bandeira.'}
            </small>
          </div>
          <button className="btn country-map" onClick={() => game.focusWorld()}>
            Ver mapa completo
          </button>
        </div>

        {foreign.length === 0 && (
          <p className="empty">
            Não sobrou bandeira estrangeira no mapa. A mesa volta a encher quando o País crescer.
          </p>
        )}

        {foreign.map((k) => {
          const rel = game.diplomacy.relation(k.id);
          if (!rel) return null;
          const offers = game.diplomacy.offers(k.id);
          const holdings = Object.values(state.territories).filter((t) => t.ownerId === k.id).length;
          return (
            <div key={k.id} className="dip-card">
              <div className="dip-head">
                <span className="dip-flag" style={{ background: k.color, borderColor: k.colorDark }} />
                <div className="dip-id">
                  <span className="dip-name">{k.name}</span>
                  <span className="dip-sub">
                    {holdings} {holdings === 1 ? 'província' : 'províncias'}
                    {rel.married ? ' · casamento real' : ''}
                    {rel.pact === 'truce' && rel.pactDays > 0
                      ? ` · ${Math.ceil(rel.pactDays)} dias de trégua`
                      : ''}
                    {rel.pact === 'vassal' ? ` · ${rel.tribute} moedas/min` : ''}
                  </span>
                </div>
                <span className={`dip-pact p-${rel.pact}`}>
                  {DiplomacyManager.pactLabel(rel.pact)}
                </span>
              </div>

              <Attitude value={rel.attitude} />

              <div className="dip-offers">
                {offers.map((o) => (
                  <button
                    key={o.id}
                    className={`dip-offer ${o.id === 'war' ? 'danger' : ''} ${o.lock ? 'locked' : ''}`}
                    disabled={Boolean(o.lock)}
                    onClick={() => game.diplomaticAct(k.id, o.id)}
                    title={o.lock ?? o.hint}
                  >
                    <span className="ol">{o.label}</span>
                    <span className="oc">
                      {o.lock ? o.lock : o.coin > 0 ? `${o.coin} moedas` : o.hint}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
