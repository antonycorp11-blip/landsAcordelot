import { useState } from 'react';
import type { Game } from '../game/Game';
import { RAW_RESOURCES, REFINED_RESOURCES, type GameState, type ResourceKind } from '../game/types';
import { IconPop, RESOURCE_HINT, RESOURCE_ICON, RESOURCE_LABEL } from './icons';

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.floor(n));
}

function Chip({
  kind,
  value,
  rate,
  cap,
}: {
  kind: ResourceKind;
  value: number;
  rate: number;
  cap: number;
}) {
  const [tip, setTip] = useState(false);
  const Icon = RESOURCE_ICON[kind];
  const low = kind === 'food' && value < 60;
  return (
    <div
      className={`res ${low ? 'low' : ''}`}
      onMouseEnter={() => setTip(true)}
      onMouseLeave={() => setTip(false)}
    >
      <span className="icon">
        <Icon />
      </span>
      <span className="val">{fmt(value)}</span>
      <span className={`rate ${rate < -0.05 ? 'neg' : ''}`}>
        {rate >= 0 ? '+' : ''}
        {rate.toFixed(1)}
      </span>
      {tip && (
        <div className="res-tip">
          <b>{RESOURCE_LABEL[kind]}</b>
          {RESOURCE_HINT[kind]}
          <br />
          {rate >= 0 ? '+' : ''}
          {rate.toFixed(1)}/min · estoque {Math.floor(value)} / {cap}
        </div>
      )}
    </div>
  );
}

/** HUD superior: brutos, refinados, população e controle de tempo (§36/§76). */
export function TopBar({ game, state }: { game: Game; state: GameState }) {
  const kingdom = state.kingdoms[state.playerKingdomId];
  const rates = game.economy.kingdomNet(kingdom.id);
  const cap = Math.round(game.economy.kingdomStorage(kingdom.id));
  const speeds: GameState['time']['speed'][] = [0, 1, 2, 4];

  let population = 0;
  let workers = 0;
  for (const t of Object.values(state.territories)) {
    if (t.ownerId !== kingdom.id) continue;
    population += t.population;
    workers += t.hiredWorkers;
  }

  return (
    <div className="topbar">
      <div className="res-group">
        {RAW_RESOURCES.map((k) => (
          <Chip key={k} kind={k} value={kingdom.resources[k]} rate={rates[k]} cap={cap} />
        ))}
      </div>
      <div className="res-group">
        {REFINED_RESOURCES.map((k) => (
          <Chip key={k} kind={k} value={kingdom.resources[k]} rate={rates[k]} cap={cap} />
        ))}
      </div>
      <div className="res-group">
        <div className="res" title="População / trabalhadores contratados">
          <span className="icon">
            <IconPop />
          </span>
          <span className="val">{fmt(population)}</span>
          <span className="rate">{workers}t</span>
        </div>
      </div>

      <div className="clock">
        <span className="day">Dia {state.time.day}</span>
        {speeds.map((s) => (
          <button
            key={s}
            className={`speed-btn ${state.time.speed === s ? 'active' : ''}`}
            onClick={() => game.setSpeed(s)}
            title={s === 0 ? 'Pausar' : `Velocidade ${s}x`}
          >
            {s === 0 ? '❚❚' : `${s}x`}
          </button>
        ))}
      </div>
    </div>
  );
}
