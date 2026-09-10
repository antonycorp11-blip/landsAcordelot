import { useState } from 'react';
import type { Game } from '../game/Game';
import { assetUrl } from '../game/config/version';
import type { GameState, ResourceKind } from '../game/types';
import { IconChain, IconPop, IconSun, RESOURCE_HINT, RESOURCE_ICON, RESOURCE_LABEL } from './icons';

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`;
  return Math.floor(n).toLocaleString('pt-BR');
}

/**
 * A barra mostra o que se gasta. Madeira, pedra e minério aparecem porque são
 * o que o jogador vê nascer no mapa; tábuas, tijolos e minério de ouro vivem no
 * painel de economia, junto com os gargalos que explicam cada número.
 */
const PRIMARY: ResourceKind[] = ['coin', 'food', 'wood', 'stone', 'iron'];

function Chip({ kind, value, rate }: { kind: ResourceKind; value: number; rate: number }) {
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
      <span className="stack">
        <span className="val">{fmt(value)}</span>
        <span className={`rate ${rate < -0.05 ? 'neg' : rate > 0.05 ? 'pos' : ''}`}>
          {rate >= 0 ? '+' : ''}
          {rate.toFixed(1)}/min
        </span>
      </span>
      {tip && (
        <div className="res-tip">
          <b>{RESOURCE_LABEL[kind]}</b>
          {RESOURCE_HINT[kind]}
        </div>
      )}
    </div>
  );
}

/** HUD superior: reino, recursos, calendário e controle de tempo (§36/§76). */
export function TopBar({
  game,
  state,
  economyOpen,
  onToggleEconomy,
}: {
  game: Game;
  state: GameState;
  economyOpen: boolean;
  onToggleEconomy: () => void;
}) {
  const kingdom = state.kingdoms[state.playerKingdomId];
  const rates = game.economy.kingdomNet(kingdom.id);
  const speeds: GameState['time']['speed'][] = [0, 1, 2, 4];
  const date = game.calendar();

  let population = 0;
  let stalled = 0;
  for (const t of Object.values(state.territories)) {
    if (t.ownerId !== kingdom.id) continue;
    population += t.population;
    for (const id of t.buildingIds) {
      const b = state.buildings[id];
      if (b && b.construction === 0 && b.workers === 0) stalled++;
    }
  }

  return (
    <div className="topbar">
      <div className="crown-block">
        <img className="crown-banner" src={assetUrl('/ui/banner.webp')} alt="" />
        <div>
          <div className="crown-name gilded">Reino de {kingdom.name}</div>
          <div className="crown-motto">Paz, Prosperidade, Unidade</div>
        </div>
      </div>
      <div className="crown-sep" />

      <div className="res-group">
        {PRIMARY.map((k) => (
          <Chip key={k} kind={k} value={kingdom.resources[k]} rate={rates[k]} />
        ))}
        <div className="res" title="População do reino">
          <span className="icon">
            <IconPop />
          </span>
          <span className="stack">
            <span className="val">{fmt(population)}</span>
            <span className="rate">População</span>
          </span>
        </div>
        <button
          className={`econ-toggle ${economyOpen ? 'active' : ''} ${stalled > 0 ? 'alert' : ''}`}
          onClick={onToggleEconomy}
          title="Economia do reino: cadeia completa, estoque e gargalos"
        >
          <IconChain />
          {stalled > 0 && <i className="dot" />}
        </button>
      </div>

      <div className="crown-sep" />
      <div className="clock">
        <span className="sun">
          <IconSun />
        </span>
        <span className="date">
          <span className="d">Dia {date.day}</span>
          <span className="s">
            {date.season}, {date.year}
          </span>
        </span>
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
