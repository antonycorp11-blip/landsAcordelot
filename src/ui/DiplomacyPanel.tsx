import { useState } from 'react';
import { spriteUrl } from '../game/config/version';
import type { Game } from '../game/Game';
import { DiplomacyManager } from '../game/managers/DiplomacyManager';
import { otherSide } from '../game/data/rulers';
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
 * A corte de um soberano.
 *
 * Retrato, a fala com que ele recebe você hoje, o dossiê da casa e — o que
 * mais importa — as razões da opinião dele, uma a uma. Ver "-32 por Vau do
 * Sul, faltam 18 dias" é uma informação com a qual se pode fazer alguma
 * coisa; ver "-40" não é.
 */
function Court({
  game,
  state,
  kingdomId,
  onBack,
}: {
  game: Game;
  state: GameState;
  kingdomId: string;
  onBack: () => void;
}) {
  const [topic, setTopic] = useState<'casa' | 'querer' | 'guerra' | null>(null);
  const kingdom = state.kingdoms[kingdomId];
  const ruler = game.diplomacy.ruler(kingdomId);
  const rel = game.diplomacy.relation(kingdomId);
  if (!kingdom || !ruler || !rel) return null;

  const offers = game.diplomacy.offers(kingdomId);
  const feuds = game.diplomacy.feuds(kingdomId);
  const holdings = Object.values(state.territories).filter((t) => t.ownerId === kingdomId).length;
  const said = topic ? ruler.topics[topic] : game.diplomacy.greeting(kingdomId);

  return (
    <>
      <button className="dip-back" onClick={onBack}>
        ‹ Todos os vizinhos
      </button>

      <div className="court">
        <img className="court-face" src={spriteUrl(ruler.portrait)} alt="" />
        <div className="court-id">
          <span className="court-name">{ruler.name}</span>
          <span className="court-epithet">{ruler.epithet}</span>
          <span className="court-title">{ruler.title}</span>
          <span className={`dip-pact p-${rel.pact}`}>{DiplomacyManager.pactLabel(rel.pact)}</span>
        </div>
      </div>

      <blockquote className={`court-say ${topic ? 'answer' : ''}`}>{said}</blockquote>

      <div className="court-topics">
        {(
          [
            ['casa', 'Fale-me da sua casa'],
            ['querer', 'O que quer de mim?'],
            ['guerra', 'E quanto à guerra?'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            className={topic === id ? 'active' : ''}
            onClick={() => setTopic(topic === id ? null : id)}
          >
            {label}
          </button>
        ))}
      </div>

      <Attitude value={rel.attitude} />

      <div className="court-block">
        <span className="court-h">Por que ele pensa assim</span>
        {rel.opinions.length === 0 && <p className="court-none">Nada pesa entre vocês. Ainda.</p>}
        {rel.opinions.map((o, i) => (
          <div className="op-row" key={`${o.id}_${i}`}>
            <span className="op-label">{o.label}</span>
            {o.days !== null && <span className="op-days">{Math.ceil(o.days)}d</span>}
            <span className={`op-val ${o.value >= 0 ? 'up' : 'down'}`}>
              {o.value > 0 ? '+' : ''}
              {o.value}
            </span>
          </div>
        ))}
      </div>

      <div className="court-block">
        <span className="court-h">
          {ruler.house} · {holdings} {holdings === 1 ? 'província' : 'províncias'}
        </span>
        <p className="court-history">{ruler.history}</p>
        <p className="court-creed">“{ruler.creed}”</p>
        <div className="court-traits">
          {ruler.traits.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
      </div>

      {feuds.length > 0 && (
        <div className="court-block">
          <span className="court-h">Histórias antigas</span>
          {feuds.map((f) => {
            const other = state.kingdoms[otherSide(f, kingdomId)];
            return (
              <div className={`feud ${f.kind}`} key={f.id}>
                <span className="feud-title">
                  {f.title}
                  {other ? ` · ${other.name}` : ''}
                </span>
                <p>{f.text}</p>
              </div>
            );
          })}
        </div>
      )}

      <div className="dip-offers">
        {offers.map((o) => (
          <button
            key={o.id}
            className={`dip-offer ${o.id === 'war' ? 'danger' : ''} ${o.lock ? 'locked' : ''}`}
            disabled={Boolean(o.lock)}
            onClick={() => game.diplomaticAct(kingdomId, o.id)}
            title={o.lock ?? o.hint}
          >
            <span className="ol">{o.label}</span>
            <span className="oc">{o.lock ? o.lock : o.coin > 0 ? `${o.coin} moedas` : o.hint}</span>
          </button>
        ))}
      </div>
    </>
  );
}

/** A mesa: quem são os vizinhos e o que pensam de você (§17). */
export function DiplomacyPanel({
  game,
  state,
  onClose,
}: {
  game: Game;
  state: GameState;
  onClose: () => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const foreign = game.diplomacy.foreignKingdoms();
  const current = open && foreign.some((k) => k.id === open) ? open : null;

  return (
    <div className="panel left dip-panel">
      <div className="panel-head">
        <div className="grow">
          <div className="title">Diplomacia</div>
          <div className="sub">
            {foreign.length === 0
              ? 'Nenhum vizinho de pé'
              : `${foreign.length} ${foreign.length === 1 ? 'corte' : 'cortes'} conhecidas`}
          </div>
        </div>
        <button className="close" onClick={onClose}>
          ×
        </button>
      </div>

      <div className="panel-body">
        {current ? (
          <Court game={game} state={state} kingdomId={current} onBack={() => setOpen(null)} />
        ) : (
          <>
            {state.stage === 'state' && (
              <div className="dip-country">
                <div className="dip-country-copy">
                  <span className="eyebrow">FRONTEIRAS DO PAÍS</span>
                  <strong>{Object.keys(state.territories).length} províncias reveladas</strong>
                </div>
                <button className="btn country-map" onClick={() => game.focusWorld()}>
                  Ver mapa completo
                </button>
              </div>
            )}

            {foreign.length === 0 && (
              <p className="empty">
                Não sobrou bandeira estrangeira no mapa. A mesa volta a encher quando o País
                crescer.
              </p>
            )}

            {foreign.map((k) => {
              const rel = game.diplomacy.relation(k.id);
              const ruler = game.diplomacy.ruler(k.id);
              if (!rel) return null;
              return (
                <button key={k.id} className="dip-row" onClick={() => setOpen(k.id)}>
                  {ruler ? (
                    <img className="dip-face" src={spriteUrl(ruler.portrait)} alt="" />
                  ) : (
                    <span
                      className="dip-flag"
                      style={{ background: k.color, borderColor: k.colorDark }}
                    />
                  )}
                  <span className="dip-id">
                    <span className="dip-name">{ruler ? ruler.name : k.name}</span>
                    <span className="dip-sub">
                      {ruler ? `${ruler.title}` : k.name}
                    </span>
                  </span>
                  <span className="dip-right">
                    <span className={`dip-pact p-${rel.pact}`}>
                      {DiplomacyManager.pactLabel(rel.pact)}
                    </span>
                    <span
                      className={`dip-num ${rel.attitude < -20 ? 'bad' : rel.attitude > 20 ? 'good' : ''}`}
                    >
                      {rel.attitude > 0 ? '+' : ''}
                      {rel.attitude}
                    </span>
                  </span>
                </button>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
