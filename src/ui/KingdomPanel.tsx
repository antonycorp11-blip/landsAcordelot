import type { Game } from '../game/Game';
import { RESOURCE_KINDS, type GameState } from '../game/types';
import { RESOURCE_ICON, RESOURCE_LABEL } from './icons';

/** Título, renome e crônica — a progressão do reino (§5). */
function RealmHeader({ game }: { game: Game }) {
  const title = game.realm.title();
  const stats = game.state.stats;
  const chronicle = game.realm.unlocked();

  return (
    <>
      <div className="realm-title">
        <div className="rank">{title.name}</div>
        <div className="scale">{title.scale}</div>
        <div className="bar">
          <i style={{ width: `${title.progress * 100}%`, background: 'var(--gold-edge)' }} />
        </div>
        <div className="renown">
          {title.renown} de renome
          {title.nextAt !== null && ` · ${title.nextName} aos ${title.nextAt}`}
        </div>
      </div>

      <div className="stat-grid" style={{ marginBottom: 4 }}>
        <div className="stat">
          <div className="k">Batalhas vencidas</div>
          <div className="v">{stats.battlesWon}</div>
        </div>
        <div className="stat">
          <div className="k">Terras tomadas</div>
          <div className="v">{stats.territoriesTaken}</div>
        </div>
      </div>

      {chronicle.length > 0 && (
        <>
          <div className="section-title">Crônica de Acordelot</div>
          {[...chronicle].reverse().map((c) => (
            <div className="chron" key={c.id}>
              <span className="ct">{c.title}</span>
              <span className="cx">{c.text}</span>
            </div>
          ))}
        </>
      )}
    </>
  );
}

/** Visão geral do reino, produção somada e vizinhos conhecidos. */
export function KingdomPanel({
  game,
  state,
  onClose,
}: {
  game: Game;
  state: GameState;
  onClose: () => void;
}) {
  const kingdoms = Object.values(state.kingdoms);
  const territories = Object.values(state.territories);
  const player = state.kingdoms[state.playerKingdomId];
  const mine = territories.filter((t) => t.ownerId === player.id);
  const totalPop = mine.reduce((a, t) => a + t.population, 0);
  const net = game.economy.kingdomNet(player.id);
  const armyPower = Object.values(state.armies)
    .filter((a) => a.ownerId === player.id)
    .reduce((sum, a) => sum + game.armies.power(a), 0);

  return (
    <div className="panel left">
      <div className="panel-head">
        <span className="owner-dot" style={{ background: player.color }} />
        <div className="grow">
          <div className="title">{player.name}</div>
          <div className="sub">Seu domínio</div>
        </div>
        <button className="close" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="panel-body">
        <RealmHeader game={game} />

        <div className="stat-grid">
          <div className="stat">
            <div className="k">Territórios</div>
            <div className="v">
              {mine.length} <small>/ {territories.length}</small>
            </div>
          </div>
          <div className="stat">
            <div className="k">Súditos</div>
            <div className="v">{Math.round(totalPop).toLocaleString('pt-BR')}</div>
          </div>
          <div className="stat">
            <div className="k">Poder militar</div>
            <div className="v">{armyPower}</div>
          </div>
          <div className="stat">
            <div className="k">Estoque máximo</div>
            <div className="v">{Math.round(game.economy.kingdomStorage(player.id))}</div>
          </div>
        </div>

        <div className="section-title">Saldo do reino / min</div>
        {RESOURCE_KINDS.filter((k) => Math.abs(net[k]) > 0.05).map((k) => {
          const Icon = RESOURCE_ICON[k];
          return (
            <div className="row" key={k}>
              <Icon />
              <span className="grow">{RESOURCE_LABEL[k]}</span>
              <span className="right">
                <span className={`n ${net[k] < 0 ? 'neg' : ''}`}>
                  {net[k] >= 0 ? '+' : ''}
                  {net[k].toFixed(1)}
                </span>
              </span>
            </div>
          );
        })}

        <div className="section-title">Meus territórios</div>
        {mine.map((t) => (
          <button
            className="row clickable"
            key={t.id}
            onClick={() => {
              game.select(t.id);
              game.focusTerritory(t.id, Math.max(game.camera.zoom, 0.9));
            }}
          >
            <span className="owner-dot" style={{ background: player.color }} />
            <span className="grow">
              <span className="name">{t.name}</span>
              <span className="meta">
                {t.buildingIds.length} construções · {t.hiredWorkers} trabalhadores
              </span>
            </span>
          </button>
        ))}

        <div className="section-title">Reinos conhecidos</div>
        {kingdoms
          .filter((k) => k.id !== player.id)
          .map((k) => {
            const count = territories.filter((t) => t.ownerId === k.id).length;
            const capital = k.capitalTerritoryId ? state.territories[k.capitalTerritoryId] : null;
            return (
              <button
                className="row clickable"
                key={k.id}
                onClick={() => {
                  if (!capital) return;
                  game.select(capital.id);
                  game.focusTerritory(capital.id, 0.8);
                }}
              >
                <span className="owner-dot" style={{ background: k.color }} />
                <span className="grow">
                  <span className="name">{k.name}</span>
                  <span className="meta">{count} territórios · relação neutra</span>
                </span>
              </button>
            );
          })}

        <div className="hint">
          Diplomacia, religião e influência entram nas próximas entregas. Por ora, a relação com
          todos é <strong>neutra</strong>.
        </div>
      </div>
    </div>
  );
}
