import type { Game } from '../game/Game';
import { BUILDING_DEFS } from '../game/data/defs';
import {
  RAW_RESOURCES,
  REFINED_RESOURCES,
  type GameState,
  type ResourceKind,
} from '../game/types';
import { RESOURCE_HINT, RESOURCE_ICON, RESOURCE_LABEL } from './icons';

interface Bottleneck {
  buildingId: string;
  territoryId: string;
  label: string;
  reason: string;
  severity: 'stopped' | 'starved';
}

/**
 * Encontra o que está travando a economia. É a informação que estava
 * escondida atrás de nove números na barra: não interessa o estoque, interessa
 * *por que* ele não sobe.
 */
function findBottlenecks(game: Game, state: GameState): Bottleneck[] {
  const out: Bottleneck[] = [];
  const wallet = state.kingdoms[state.playerKingdomId].resources;

  for (const t of game.ownedTerritories()) {
    for (const id of t.buildingIds) {
      const b = state.buildings[id];
      if (!b || b.construction > 0) continue;
      const def = BUILDING_DEFS[b.defId];
      if (!def) continue;
      const jobs = def.jobsPerLevel * Math.max(1, b.level);

      if (jobs > 0 && b.workers === 0) {
        out.push({
          buildingId: b.id,
          territoryId: t.id,
          label: `${def.name} · ${t.name}`,
          reason: 'parado: sem trabalhadores',
          severity: 'stopped',
        });
        continue;
      }
      if (def.input && b.efficiency < 0.85) {
        // Aponta o insumo mais escasso, que é o gargalo real.
        let scarcest: ResourceKind | null = null;
        let least = Infinity;
        for (const k of Object.keys(def.input) as ResourceKind[]) {
          if (wallet[k] < least) {
            least = wallet[k];
            scarcest = k;
          }
        }
        out.push({
          buildingId: b.id,
          territoryId: t.id,
          label: `${def.name} · ${t.name}`,
          reason: scarcest
            ? `${Math.round(b.efficiency * 100)}%: falta ${RESOURCE_LABEL[scarcest].toLowerCase()}`
            : `${Math.round(b.efficiency * 100)}% de eficiência`,
          severity: 'starved',
        });
      }
    }
  }
  return out.sort((a, b) => (a.severity === 'stopped' ? -1 : 1) - (b.severity === 'stopped' ? -1 : 1));
}

/** Detalhe completo da economia — aberto por um toque na barra superior. */
export function EconomyPanel({
  game,
  state,
  onClose,
}: {
  game: Game;
  state: GameState;
  onClose: () => void;
}) {
  const kingdom = state.kingdoms[state.playerKingdomId];
  const rates = game.economy.kingdomNet(kingdom.id);
  const cap = Math.round(game.economy.kingdomStorage(kingdom.id));
  const bottlenecks = findBottlenecks(game, state);

  const line = (k: ResourceKind) => {
    const Icon = RESOURCE_ICON[k];
    const stock = kingdom.resources[k];
    const rate = rates[k];
    const full = cap > 0 && stock >= cap - 1;
    return (
      <div className="econ-line" key={k} title={RESOURCE_HINT[k]}>
        <span className="ico">
          <Icon />
        </span>
        <span className="nm">{RESOURCE_LABEL[k]}</span>
        <span className={`stock ${full ? 'full' : ''}`}>
          {Math.floor(stock)}
          {cap > 0 && <small> / {cap}</small>}
        </span>
        <span className={`rt ${rate < -0.05 ? 'neg' : rate > 0.05 ? 'pos' : ''}`}>
          {rate >= 0 ? '+' : ''}
          {rate.toFixed(1)}
        </span>
      </div>
    );
  };

  return (
    <div className="econ-pop">
      <div className="econ-head">
        <div className="grow">
          <div className="title">Economia do reino</div>
          <div className="sub">Estoque · saldo por minuto</div>
        </div>
        <button className="close" onClick={onClose}>
          ×
        </button>
      </div>

      <div className="econ-body">
        <div className="econ-group">
          <div className="econ-cap">Brutos — saem do solo</div>
          {RAW_RESOURCES.map(line)}
        </div>
        <div className="econ-group">
          <div className="econ-cap">Refinados — o que você gasta</div>
          {REFINED_RESOURCES.map(line)}
        </div>

        <div className="econ-group">
          <div className="econ-cap">
            Gargalos {bottlenecks.length > 0 && `(${bottlenecks.length})`}
          </div>
          {bottlenecks.length === 0 && (
            <div className="econ-ok">Nenhuma produção travada. A cadeia está girando.</div>
          )}
          {bottlenecks.slice(0, 8).map((b) => (
            <button
              className={`econ-issue ${b.severity}`}
              key={b.buildingId}
              onClick={() => {
                game.select(b.territoryId);
                game.selectBuilding(b.buildingId);
                game.requestedTab = 'work';
                onClose();
              }}
            >
              <span className="nm">{b.label}</span>
              <span className="why">{b.reason}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
