import type { Game } from '../game/Game';
import { UNIT_DEFS } from '../game/data/defs';
import type { GameState, UnitKind } from '../game/types';

function count(units: Partial<Record<UnitKind, number>>): number {
  return Object.values(units).reduce((a: number, n) => a + (n ?? 0), 0);
}

/**
 * CampaignPanel — o que está em campo agora: colunas em marcha e batalhas.
 * É a janela de logística do jogador (§16) e o lugar de mandar recuar.
 */
export function CampaignPanel({
  game,
  state,
  onClose,
}: {
  game: Game;
  state: GameState;
  onClose: () => void;
}) {
  const campaigns = game.playerCampaigns();
  const battles = game.activeBattles();
  const journal = game.ai.journal;

  return (
    <div className="panel left">
      <div className="panel-head">
        <div className="grow">
          <div className="title">Campanhas</div>
          <div className="sub">Colunas em campo</div>
        </div>
        <button className="close" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="panel-body">
        {campaigns.length === 0 && battles.length === 0 && (
          <div className="empty">
            Nenhuma tropa em campo.
            <br />
            Selecione um território seu, abra a aba <strong>MILITAR</strong> e monte uma expedição.
          </div>
        )}

        {campaigns.length > 0 && <div className="section-title">Em marcha</div>}
        {campaigns.map((army) => {
          const target = army.targetTerritoryId ? state.territories[army.targetTerritoryId] : null;
          const progress = army.pathLength > 0 ? army.pathDistance / army.pathLength : 0;
          return (
            <div className={`row ${army.supplies <= 0 ? 'idle' : ''}`} key={army.id}>
              <div className="grow">
                <span className="name">{army.name}</span>
                <span className="meta">
                  {count(army.units)} soldados ·{' '}
                  {army.state === 'returning' ? 'recuando' : `rumo a ${target?.name ?? '—'}`} · moral{' '}
                  {Math.round(army.morale)}
                  {army.supplies <= 0 ? ' · SEM SUPRIMENTO' : ''}
                </span>
                <div className="bar">
                  <i
                    style={{
                      width: `${Math.min(100, progress * 100)}%`,
                      background: army.supplies <= 0 ? '#f0616a' : '#4d8ff0',
                    }}
                  />
                </div>
              </div>
              <div className="stepper">
                <button className="btn sm" onClick={() => game.focusArmy(army.id)}>
                  Ver
                </button>
                {army.state === 'marching' && (
                  <button className="btn sm danger" onClick={() => game.recallArmy(army.id)}>
                    Recuar
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {battles.length > 0 && <div className="section-title">Batalhas</div>}
        {battles.map((b) => {
          const t = state.territories[b.territoryId];
          const atk = b.attacker.kingdomId ? state.kingdoms[b.attacker.kingdomId] : null;
          const def = b.defender.kingdomId ? state.kingdoms[b.defender.kingdomId] : null;
          return (
            <button
              className="row clickable busy"
              key={b.id}
              onClick={() => {
                game.camera.focus(b.position, Math.max(game.camera.zoom, 0.9));
                game.select(b.territoryId);
              }}
            >
              <div className="grow">
                <span className="name">{t?.name ?? 'Campo de batalha'}</span>
                <span className="meta">
                  {atk?.name ?? 'Atacante'} {count(b.attacker.units)} ×{' '}
                  {count(b.defender.units)} {def?.name ?? 'Defensor'} · rodada {b.round}
                </span>
                {b.log.length > 0 && <span className="meta">{b.log[b.log.length - 1]}</span>}
              </div>
            </button>
          );
        })}

        {journal.length > 0 && (
          <>
            <div className="section-title">O que os vizinhos andam fazendo</div>
            {[...journal]
              .reverse()
              .slice(0, 6)
              .map((line, i) => (
                <div className="row" key={i}>
                  <span className="meta" style={{ marginTop: 0 }}>
                    {line}
                  </span>
                </div>
              ))}
          </>
        )}

        <div className="hint">
          Distância custa comida e tempo. Uma coluna sem suprimento perde moral rápido — e moral
          baixa faz o exército debandar antes de perder a batalha.
        </div>
      </div>
    </div>
  );
}

/** Unidades disponíveis, para tooltips na UI. */
export const UNIT_NAMES = Object.fromEntries(
  Object.entries(UNIT_DEFS).map(([k, v]) => [k, v.name]),
) as Record<UnitKind, string>;
