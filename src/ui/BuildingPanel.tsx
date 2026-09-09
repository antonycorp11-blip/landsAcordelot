import { useState } from 'react';
import { BUILDING_DEFS, UNIT_DEFS, UNIT_LIST } from '../game/data/defs';
import type { Game } from '../game/Game';
import { BUILDING_WORKER, buildingSprite } from '../game/render/spriteCatalog';
import {
  RESOURCE_KINDS,
  type Building,
  type GameState,
  type ResourceBag,
  type ResourceKind,
  type UnitKind,
} from '../game/types';
import { RESOURCE_ICON, RESOURCE_LABEL } from './icons';

function Sprite({ path, className }: { path?: string; className: string }) {
  const [ok, setOk] = useState(true);
  if (!path || !ok) return <div className={className} />;
  return <img className={className} src={`/assets/${path}.webp`} alt="" onError={() => setOk(false)} />;
}

function CostList({ cost, have }: { cost: Partial<ResourceBag>; have: ResourceBag }) {
  return (
    <div className="cost">
      {RESOURCE_KINDS.filter((k) => (cost[k] ?? 0) > 0).map((k) => {
        const Icon = RESOURCE_ICON[k];
        return (
          <span key={k} className={have[k] < (cost[k] ?? 0) ? 'missing' : ''} title={RESOURCE_LABEL[k]}>
            <Icon />
            {Math.round(cost[k]!)}
          </span>
        );
      })}
    </div>
  );
}

/**
 * BuildingPanel — a tela da construção.
 *
 * Quando o jogador abre a madeireira, ele vê a madeireira: os trabalhadores
 * alocados, o que entra, o que sai e o que falta. Nada de território, nada de
 * catálogo, nada de exército dividindo espaço com ela.
 */
export function BuildingPanel({
  game,
  state,
  building,
  onClose,
}: {
  game: Game;
  state: GameState;
  building: Building;
  onClose: () => void;
}) {
  const def = BUILDING_DEFS[building.defId];
  const territory = state.territories[building.territoryId];
  const report = game.economy.report(territory);
  const wallet = game.playerKingdom.resources;

  const level = Math.max(1, building.level);
  const jobs = def.jobsPerLevel * level;
  const underConstruction = building.construction > 0;
  const deposit = building.depositId ? state.deposits[building.depositId] : null;
  const up = game.buildings.checkUpgrade(building);
  const scale = game.economy.buildingScale(building, territory);

  const progress = underConstruction
    ? 1 - building.construction / Math.max(1, game.buildings.timeFor(def.id, building.targetLevel))
    : 1;

  const workerSprite = BUILDING_WORKER[building.defId];
  const isBarracks = Boolean(def.enablesRecruit);
  const isMarket = Boolean(def.enablesTrade);

  return (
    <div className="panel building-panel">
      <div className="bld-hero">
        <Sprite path={buildingSprite(building.defId, building.id)} className="bld-art" />
        <button className="close bld-close" onClick={onClose} title="Voltar ao território">
          ×
        </button>
        <div className="bld-title">
          <div className="name">{def.name}</div>
          <div className="sub">
            Nível {level} · {territory.name}
          </div>
        </div>
      </div>

      <div className="panel-body">
        {underConstruction && (
          <div className="row busy">
            <div className="grow">
              <span className="name">Obra em andamento</span>
              <span className="meta">
                {Math.ceil(building.construction)}s para o nível {building.targetLevel}
              </span>
              <div className="bar">
                <i style={{ width: `${progress * 100}%`, background: '#f2c33d' }} />
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------- trabalhadores ------------------- */}
        {!underConstruction && jobs > 0 && (
          <>
            <div className="section-title">Trabalhadores</div>
            <div className="worker-grid">
              {Array.from({ length: jobs }).map((_, i) => (
                <div className={`worker-slot ${i < building.workers ? 'filled' : ''}`} key={i}>
                  {i < building.workers ? (
                    <Sprite path={workerSprite} className="worker-art" />
                  ) : (
                    <span className="empty-mark">+</span>
                  )}
                </div>
              ))}
            </div>
            <div className="worker-actions">
              <div className="stepper">
                <button onClick={() => game.assignWorker(building.id, -1)} disabled={building.workers <= 0}>
                  −
                </button>
                <span className="n">
                  {building.workers}/{jobs}
                </span>
                <button
                  onClick={() => game.assignWorker(building.id, +1)}
                  disabled={building.workers >= jobs || report.idleWorkers <= 0}
                >
                  +
                </button>
              </div>
              <button
                className="btn sm"
                onClick={() => game.hireWorker(building.territoryId)}
                title={game.buildings.canHire(territory).reason}
              >
                Contratar ({game.buildings.hireCost()} ouro)
              </button>
              <span className="meta" style={{ marginLeft: 'auto' }}>
                {report.idleWorkers} ocioso{report.idleWorkers === 1 ? '' : 's'}
              </span>
            </div>
            {building.workers === 0 && (
              <div className="hint" style={{ borderLeftColor: 'var(--bad)' }}>
                Prédio vazio não produz nada. Aloque ao menos um trabalhador.
              </div>
            )}
          </>
        )}

        {/* ------------------------------- produção ------------------------ */}
        {!underConstruction && (def.input || def.output) && (
          <>
            <div className="section-title">Produção por minuto</div>
            {def.input && (
              <div className="flow">
                <span className="flow-cap">Consome</span>
                {(Object.keys(def.input) as ResourceKind[]).map((k) => {
                  const Icon = RESOURCE_ICON[k];
                  return (
                    <span className="flow-item neg" key={`i-${k}`}>
                      <Icon />
                      {(def.input![k]! * scale).toFixed(1)}
                    </span>
                  );
                })}
              </div>
            )}
            {def.output && (
              <div className="flow">
                <span className="flow-cap">Produz</span>
                {(Object.keys(def.output) as ResourceKind[]).map((k) => {
                  const Icon = RESOURCE_ICON[k];
                  return (
                    <span className="flow-item pos" key={`o-${k}`}>
                      <Icon />
                      {(def.output![k]! * scale * (def.input ? building.efficiency : 1)).toFixed(1)}
                    </span>
                  );
                })}
              </div>
            )}

            <div className="stat-grid" style={{ marginTop: 10 }}>
              <div className="stat">
                <div className="k">Eficiência</div>
                <div className="v">{Math.round(building.efficiency * 100)}%</div>
                <div className="bar">
                  <i
                    style={{
                      width: `${Math.round(building.efficiency * 100)}%`,
                      background: building.efficiency > 0.8 ? '#4bd07f' : '#f2c33d',
                    }}
                  />
                </div>
              </div>
              {deposit && (
                <div className="stat">
                  <div className="k">Riqueza do veio</div>
                  <div className="v">{Math.round(deposit.richness * 100)}%</div>
                </div>
              )}
            </div>

            {def.input && building.efficiency < 0.85 && building.workers > 0 && (
              <div className="hint" style={{ borderLeftColor: 'var(--gold)' }}>
                A oficina está esperando insumo. Aumente a extração do que ela consome.
              </div>
            )}
          </>
        )}

        {/* ------------------------------- efeitos ------------------------- */}
        {!underConstruction && (def.housing || def.storage) && (
          <>
            <div className="section-title">Efeito</div>
            <div className="row">
              <span className="grow">
                {def.housing ? 'Moradia' : 'Capacidade de estoque'}
              </span>
              <span className="right">
                <span className="n">+{(def.housing ?? def.storage!) * level}</span>
              </span>
            </div>
          </>
        )}

        {/* ------------------------------- quartel ------------------------- */}
        {!underConstruction && isBarracks && (
          <>
            <div className="section-title">Unidades liberadas</div>
            {UNIT_LIST.map((u) => {
              const locked = level < u.requiresBarracks;
              const check = game.armies.checkRecruit(territory, u.id);
              return (
                <div className={`row ${locked ? '' : 'ok'}`} key={u.id}>
                  <Sprite path={`units/${u.id}`} className="thumb" />
                  <div className="grow">
                    <span className="name">{u.name}</span>
                    <span className="meta">
                      {locked ? `Exige nível ${u.requiresBarracks}` : u.description}
                    </span>
                    <CostList cost={u.cost} have={wallet} />
                  </div>
                  <button
                    className="btn sm primary"
                    disabled={!check.ok}
                    title={check.reason}
                    onClick={() => game.recruit(territory.id, u.id)}
                  >
                    {u.trainTime}s
                  </button>
                </div>
              );
            })}
            {state.training.filter((o) => o.territoryId === territory.id).length > 0 && (
              <>
                <div className="section-title">Na fila</div>
                {state.training
                  .filter((o) => o.territoryId === territory.id)
                  .map((o) => (
                    <div className="row busy" key={o.id}>
                      <div className="grow">
                        <span className="name">{UNIT_DEFS[o.unit as UnitKind].name}</span>
                        <span className="meta">{Math.ceil(o.remaining)}s</span>
                        <div className="bar">
                          <i
                            style={{
                              width: `${(1 - o.remaining / o.total) * 100}%`,
                              background: '#4bd07f',
                            }}
                          />
                        </div>
                      </div>
                      <button className="btn sm danger" onClick={() => game.cancelTraining(o.id)}>
                        ✕
                      </button>
                    </div>
                  ))}
              </>
            )}
          </>
        )}

        {/* ------------------------------- mercado ------------------------- */}
        {!underConstruction && isMarket && (
          <div className="hint" style={{ borderLeftColor: 'var(--gold)' }}>
            As caravanas partem daqui. A margem cai de{' '}
            <strong>{Math.round(game.trade.spreadFor(level) * 100)}%</strong> e cada viagem leva até{' '}
            <strong>{game.trade.capacityFor(level)}</strong> de valor. Use a aba{' '}
            <strong>Comércio</strong> do território para negociar.
          </div>
        )}

        {/* ------------------------------- evolução ------------------------ */}
        <div className="section-title">Evolução</div>
        {level < def.maxLevel ? (
          <div className="row">
            <div className="grow">
              <span className="name">
                Nível {level} → {level + 1}
              </span>
              <span className="meta">
                {up.time}s de obra · {def.jobsPerLevel} vaga
                {def.jobsPerLevel === 1 ? '' : 's'} a mais
              </span>
              <CostList cost={up.cost} have={wallet} />
            </div>
          </div>
        ) : (
          <div className="empty">Esta construção já está no nível máximo.</div>
        )}

        <div className="actions">
          <button
            className="btn primary wide"
            disabled={!up.ok}
            title={up.reason}
            onClick={() => game.upgradeBuilding(building.id)}
          >
            {level >= def.maxLevel ? 'Nível máximo' : `Evoluir para o nível ${level + 1}`}
          </button>
          <div style={{ display: 'flex', gap: 7 }}>
            <button className="btn sm" style={{ flex: 1 }} onClick={() => game.focusBuilding(building.id)}>
              Ver no mapa
            </button>
            <button
              className="btn sm danger"
              style={{ flex: 1 }}
              title="Devolve 40% do custo"
              onClick={() => {
                game.demolishBuilding(building.id);
                onClose();
              }}
            >
              Demolir
            </button>
          </div>
        </div>

        <div className="hint">{def.description}</div>
      </div>
    </div>
  );
}
