import { useEffect, useState } from 'react';
import type { Game } from '../game/Game';
import { BUILDING_LIST, BUILDING_DEFS, UNIT_LIST, UNIT_DEFS } from '../game/data/defs';
import { WORKFORCE } from '../game/config/balance';
import type { UnitStack } from '../game/managers/ArmyManager';
import {
  RESOURCE_KINDS,
  type ResourceKind,
  type Building,
  type Deposit,
  type GameState,
  type ResourceBag,
  type Territory,
  type UnitKind,
} from '../game/types';
import { BUILDING_WORKER, DEPOSIT_LABEL } from '../game/render/spriteCatalog';
import { RESOURCE_ICON, RESOURCE_LABEL, IconWorker } from './icons';

const BIOME_LABEL: Record<string, string> = {
  plains: 'Planície',
  fertile: 'Terra fértil',
  forest: 'Floresta',
  hills: 'Colinas',
  mountains: 'Montanhas',
  coast: 'Costa',
  marsh: 'Pântano',
};

const TAG_LABEL: Record<string, string> = {
  bridge: 'Ponte estratégica',
  mountain_pass: 'Passo de montanha',
  harbor: 'Porto natural',
  holy_site: 'Sítio sagrado',
  old_capital: 'Antiga capital',
};

const KIND_LABEL: Record<string, string> = {
  castle: 'Castelo',
  town: 'Cidade',
  village: 'Aldeia',
  fort: 'Forte',
  ruin: 'Ruínas',
};

type Tab = 'view' | 'build' | 'work' | 'army' | 'trade' | 'borders';

const TABS: { id: Tab; label: string }[] = [
  { id: 'view', label: 'Visão' },
  { id: 'build', label: 'Construir' },
  { id: 'work', label: 'Trabalho' },
  { id: 'army', label: 'Militar' },
  { id: 'trade', label: 'Comércio' },
  { id: 'borders', label: 'Fronteiras' },
];

function Cost({ cost, have }: { cost: Partial<ResourceBag>; have: ResourceBag }) {
  return (
    <div className="cost">
      {RESOURCE_KINDS.filter((k) => (cost[k] ?? 0) > 0).map((k) => {
        const Icon = RESOURCE_ICON[k];
        const missing = have[k] < (cost[k] ?? 0);
        return (
          <span key={k} className={missing ? 'missing' : ''} title={RESOURCE_LABEL[k]}>
            <Icon />
            {Math.round(cost[k]!)}
          </span>
        );
      })}
    </div>
  );
}

function Meter({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="stat">
      <div className="k">{label}</div>
      <div className="v">{Math.round(value)}</div>
      <div className="bar">
        <i style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
      </div>
    </div>
  );
}

function Thumb({ sprite, fallback }: { sprite?: string; fallback: string }) {
  const [ok, setOk] = useState(true);
  if (!sprite || !ok) {
    return (
      <div className="thumb" style={{ display: 'grid', placeItems: 'center', fontSize: 16 }}>
        {fallback}
      </div>
    );
  }
  return <img className="thumb" src={`/assets/${sprite}.webp`} alt="" onError={() => setOk(false)} />;
}

/**
 * CityPanel — administração do território sem sair do mapa (§10/§72).
 * Só aparecem ações que realmente existem: nada de botão decorativo (§66).
 */
export function CityPanel({
  game,
  state,
  territory,
  onClose,
}: {
  game: Game;
  state: GameState;
  territory: Territory;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>('view');
  const isPlayer = territory.ownerId === state.playerKingdomId;
  const kingdom = territory.ownerId ? state.kingdoms[territory.ownerId] : null;
  const castle = territory.castleId ? state.castles[territory.castleId] : null;
  const report = game.economy.report(territory);
  const wallet = game.playerKingdom.resources;

  // Território inimigo/neutro não tem administração: volta para a visão.
  useEffect(() => {
    if (!isPlayer && tab !== 'view' && tab !== 'borders') setTab('view');
  }, [isPlayer, tab, territory.id]);

  useEffect(() => {
    if (tab === 'build') game.markUiFlag('openedBuildTab');
  }, [tab, game]);

  // Cliques no mapa (depósito, construção) abrem direto a aba certa.
  useEffect(() => {
    if (!game.requestedTab) return;
    if (isPlayer || game.requestedTab === 'view' || game.requestedTab === 'borders') {
      setTab(game.requestedTab);
    }
    game.requestedTab = null;
  }, [game, territory.id, isPlayer, game.requestedTab]);

  const buildings = territory.buildingIds
    .map((id) => state.buildings[id])
    .filter((b): b is Building => Boolean(b));
  const deposits = territory.depositIds
    .map((id) => state.deposits[id])
    .filter((d): d is Deposit => Boolean(d));

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="owner-dot" style={{ background: kingdom?.color ?? '#b9c2cd' }} />
        <div className="grow">
          <div className="title">{territory.name}</div>
          <div className="sub">
            {kingdom ? kingdom.name : 'Território neutro'}
            {castle ? ` · ${KIND_LABEL[castle.kind]} Nv ${castle.level}` : ''}
          </div>
        </div>
        <button className="close" onClick={onClose} title="Fechar">
          ×
        </button>
      </div>

      <div className="tabs">
        {TABS.filter((t) => isPlayer || t.id === 'view' || t.id === 'borders').map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="panel-body">
        {tab === 'view' && (
          <ViewTab game={game} state={state} territory={territory} report={report} isPlayer={isPlayer} />
        )}
        {tab === 'build' && isPlayer && (
          <BuildTab game={game} territory={territory} deposits={deposits} wallet={wallet} />
        )}
        {tab === 'work' && isPlayer && (
          <WorkTab game={game} territory={territory} buildings={buildings} report={report} wallet={wallet} />
        )}
        {tab === 'army' && isPlayer && <ArmyTab game={game} state={state} territory={territory} wallet={wallet} />}
        {tab === 'trade' && isPlayer && <TradeTab game={game} territory={territory} wallet={wallet} />}
        {tab === 'borders' && <BordersTab game={game} state={state} territory={territory} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Visão ----

function ViewTab({
  game,
  state,
  territory,
  report,
  isPlayer,
}: {
  game: Game;
  state: GameState;
  territory: Territory;
  report: ReturnType<Game['economy']['report']>;
  isPlayer: boolean;
}) {
  const castle = territory.castleId ? state.castles[territory.castleId] : null;
  const offer = game.claimOffer(territory.id);
  const net = report.net;
  const positives = RESOURCE_KINDS.filter((k) => Math.abs(net[k]) > 0.05);

  return (
    <>
      <div className="tag-row">
        <span className="tag">{BIOME_LABEL[territory.biome] ?? territory.biome}</span>
        {territory.tags.map((t) => (
          <span className="tag gold" key={t}>
            {TAG_LABEL[t] ?? t}
          </span>
        ))}
      </div>

      <div className="stat-grid">
        <div className="stat">
          <div className="k">População</div>
          <div className="v">
            {Math.round(territory.population).toLocaleString('pt-BR')}{' '}
            <small>/ {report.housing}</small>
          </div>
        </div>
        <div className="stat">
          <div className="k">Defesa</div>
          <div className="v">{territory.defense + (castle?.defense ?? 0)}</div>
        </div>
        <Meter label="Felicidade" value={territory.happiness} color="#4bd07f" />
        <Meter label="Lealdade" value={territory.loyalty} color="#4d8ff0" />
        <Meter label="Estabilidade" value={territory.stability} color="#f2c33d" />
        <div className="stat">
          <div className="k">Soldados</div>
          <div className="v">{report.soldiers}</div>
        </div>
      </div>

      {isPlayer && (
        <>
          <div className="section-title">Saldo do território / min</div>
          {positives.length === 0 && <div className="empty">Nada sendo produzido aqui ainda.</div>}
          {positives.map((k) => {
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
          <div className="hint">
            Impostos <strong>+{report.taxes.toFixed(1)}</strong> · salários{' '}
            <strong>−{report.wages.toFixed(1)}</strong> · comida consumida{' '}
            <strong>−{report.foodUpkeep.toFixed(1)}</strong> por minuto.
          </div>
        </>
      )}

      <div className="actions">
        <button
          className="btn wide"
          onClick={() => game.focusTerritory(territory.id, Math.max(game.camera.zoom, 1.0))}
        >
          Centralizar câmera
        </button>
        {!isPlayer && offer.available && (
          <button
            className="btn gold wide"
            disabled={!offer.affordable}
            onClick={() => game.executeClaim(territory.id)}
          >
            Reivindicar — {offer.cost.coin} ouro · {offer.cost.food} comida
          </button>
        )}
        {!isPlayer && !offer.available && <div className="hint">{offer.reason}</div>}
      </div>
    </>
  );
}

// ------------------------------------------------------------- Construir ----

function BuildTab({
  game,
  territory,
  deposits,
  wallet,
}: {
  game: Game;
  territory: Territory;
  deposits: Deposit[];
  wallet: ResourceBag;
}) {
  const free = deposits.filter((d) => !d.buildingId);
  const urban = BUILDING_LIST.filter((d) => !d.deposit);
  const slots = game.buildings.freeCitySlots(territory);

  return (
    <>
      <div className="section-title">Depósitos livres ({free.length})</div>
      {free.length === 0 && (
        <div className="empty">
          Todo depósito deste território já está explorado.
          <br />
          Conquiste novas terras para achar mais.
        </div>
      )}
      {free.map((d) => {
        const def = BUILDING_LIST.find((b) => b.deposit === d.kind);
        if (!def) return null;
        const check = game.buildings.checkBuild(territory, def.id, d.id);
        return (
          <div className="row" key={d.id}>
            <Thumb sprite={BUILDING_WORKER[def.id]} fallback="⛏" />
            <div className="grow">
              <span className="name">{DEPOSIT_LABEL[d.kind]}</span>
              <span className="meta">
                {def.name} · riqueza {Math.round(d.richness * 100)}%
              </span>
              <Cost cost={check.cost} have={wallet} />
            </div>
            <div className="stepper">
              <button className="btn sm" title="Localizar no mapa" onClick={() => game.focusDeposit(d.id)}>
                Ver
              </button>
              <button
                className="btn sm primary"
                disabled={!check.ok}
                title={check.reason}
                onClick={() => game.build(territory.id, def.id, d.id)}
              >
                Erguer
              </button>
            </div>
          </div>
        );
      })}

      <div className="section-title">Oficinas e cidade · {slots} vagas</div>
      {urban.map((def) => {
        const check = game.buildings.checkBuild(territory, def.id);
        return (
          <div className="row" key={def.id}>
            <Thumb sprite={BUILDING_WORKER[def.id]} fallback="🏛" />
            <div className="grow">
              <span className="name">{def.name}</span>
              <span className="meta">{def.description}</span>
              <Cost cost={check.cost} have={wallet} />
            </div>
            <button
              className="btn sm primary"
              disabled={!check.ok}
              title={check.reason}
              onClick={() => game.build(territory.id, def.id)}
            >
              Erguer
            </button>
          </div>
        );
      })}
    </>
  );
}

// -------------------------------------------------------------- Trabalho ----

function WorkTab({
  game,
  territory,
  buildings,
  report,
  wallet,
}: {
  game: Game;
  territory: Territory;
  buildings: Building[];
  report: ReturnType<Game['economy']['report']>;
  wallet: ResourceBag;
}) {
  const hire = game.buildings.canHire(territory);
  const cost = game.buildings.hireCost();
  const focused = buildings.find((b) => b.id === game.selectedBuildingId) ?? null;

  return (
    <>
      <div className="stat-grid">
        <div className="stat">
          <div className="k">Trabalhadores</div>
          <div className="v">
            {territory.hiredWorkers} <small>/ {report.laborPool} possíveis</small>
          </div>
        </div>
        <div className="stat">
          <div className="k">Ociosos</div>
          <div className="v" style={{ color: report.idleWorkers > 0 ? '#f2c33d' : undefined }}>
            {report.idleWorkers}
          </div>
        </div>
      </div>

      <div className="row" style={{ marginTop: 10 }}>
        <IconWorker />
        <div className="grow">
          <span className="name">Contratar trabalhador</span>
          <span className="meta">
            {cost} ouro na contratação · salário {WORKFORCE.wagePerMinute.toFixed(2)}/min
          </span>
        </div>
        <div className="stepper">
          <button
            onClick={() => game.dismissWorker(territory.id)}
            disabled={report.idleWorkers <= 0}
            title="Dispensar um ocioso"
          >
            −
          </button>
          <button
            onClick={() => game.hireWorker(territory.id)}
            disabled={!hire.ok || wallet.coin < cost}
            title={hire.reason}
          >
            +
          </button>
        </div>
      </div>

      {focused && <BuildingCard game={game} building={focused} report={report} />}

      <div className="section-title">Construções ({buildings.length})</div>
      {buildings.length === 0 && (
        <div className="empty">Nada construído aqui. Vá para a aba CONSTRUIR.</div>
      )}
      {buildings.map((b) => {
        const def = BUILDING_DEFS[b.defId];
        const jobs = def.jobsPerLevel * Math.max(1, b.level);
        const building = b.construction > 0;
        const idle = !building && jobs > 0 && b.workers === 0;
        const starved = !building && b.workers > 0 && b.efficiency < 0.55;
        const up = game.buildings.checkUpgrade(b);
        return (
          <div
            className={`row ${idle ? 'idle' : starved ? 'busy' : ''} ${
              b.id === game.selectedBuildingId ? 'picked' : ''
            }`}
            key={b.id}
            onClick={() => game.selectBuilding(b.id)}
            style={{ cursor: 'pointer' }}
          >
            <Thumb sprite={BUILDING_WORKER[b.defId]} fallback="🏗" />
            <div className="grow">
              <span className="name">
                {def.name} <span style={{ color: 'var(--muted)' }}>Nv {b.level || 1}</span>
              </span>
              <span className="meta">
                {building
                  ? `Em obra — ${Math.ceil(b.construction)}s`
                  : idle
                    ? 'Parado: sem trabalhadores'
                    : starved
                      ? `Sem insumo · ${Math.round(b.efficiency * 100)}%`
                      : describeFlow(def)}
              </span>
              {!building && jobs > 0 && (
                <div className="stepper" style={{ marginTop: 6 }}>
                  <button onClick={() => game.assignWorker(b.id, -1)} disabled={b.workers <= 0}>
                    −
                  </button>
                  <span className="n">
                    {b.workers}/{jobs}
                  </span>
                  <button
                    onClick={() => game.assignWorker(b.id, +1)}
                    disabled={b.workers >= jobs || report.idleWorkers <= 0}
                  >
                    +
                  </button>
                </div>
              )}
            </div>
            <div className="stepper">
              <button
                className="btn sm"
                disabled={!up.ok}
                title={`${up.reason} (${Object.entries(up.cost)
                  .map(([k, v]) => `${v} ${RESOURCE_LABEL[k as keyof ResourceBag]}`)
                  .join(', ')})`}
                onClick={() => game.upgradeBuilding(b.id)}
              >
                ▲
              </button>
              <button
                className="btn sm danger"
                title="Demolir (devolve 40%)"
                onClick={() => game.demolishBuilding(b.id)}
              >
                ✕
              </button>
            </div>
          </div>
        );
      })}
    </>
  );
}

/**
 * Cartão da construção clicada no mapa: o lugar de evoluir, ajustar equipe e
 * demolir sem caçar a linha certa na lista.
 */
function BuildingCard({
  game,
  building,
  report,
}: {
  game: Game;
  building: Building;
  report: ReturnType<Game['economy']['report']>;
}) {
  const def = BUILDING_DEFS[building.defId];
  const jobs = def.jobsPerLevel * Math.max(1, building.level);
  const up = game.buildings.checkUpgrade(building);
  const wallet = game.playerKingdom.resources;
  const underConstruction = building.construction > 0;

  return (
    <div className="focus-card">
      <div className="focus-head">
        <Thumb sprite={BUILDING_WORKER[building.defId]} fallback="🏗" />
        <div className="grow">
          <span className="name">
            {def.name} <span style={{ color: 'var(--muted)' }}>Nv {building.level || 1}</span>
          </span>
          <span className="meta">
            {underConstruction
              ? `Em obra — ${Math.ceil(building.construction)}s`
              : describeFlow(def)}
          </span>
        </div>
        <button className="close" title="Fechar" onClick={() => game.selectBuilding(null)}>
          ×
        </button>
      </div>

      {!underConstruction && jobs > 0 && (
        <div className="focus-row">
          <span className="meta">Equipe</span>
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
          <span className="meta" style={{ marginLeft: 'auto' }}>
            Eficiência {Math.round(building.efficiency * 100)}%
          </span>
        </div>
      )}

      {building.level < def.maxLevel && (
        <>
          <div className="meta" style={{ marginTop: 8 }}>
            Evoluir para o nível {building.level + 1} — {up.time}s de obra
          </div>
          <Cost cost={up.cost} have={wallet} />
        </>
      )}

      <div className="focus-actions">
        <button
          className="btn sm primary grow"
          disabled={!up.ok}
          title={up.reason}
          onClick={() => game.upgradeBuilding(building.id)}
        >
          {building.level >= def.maxLevel ? 'Nível máximo' : 'Evoluir'}
        </button>
        <button className="btn sm" onClick={() => game.selectBuilding(building.id)}>
          Ver
        </button>
        <button
          className="btn sm danger"
          title="Demolir (devolve 40%)"
          onClick={() => {
            game.demolishBuilding(building.id);
            game.selectBuilding(null);
          }}
        >
          Demolir
        </button>
      </div>
    </div>
  );
}

function describeFlow(def: (typeof BUILDING_LIST)[number]): string {
  const parts: string[] = [];
  if (def.input) {
    parts.push(
      `consome ${Object.entries(def.input)
        .map(([k, v]) => `${v} ${RESOURCE_LABEL[k as keyof ResourceBag].toLowerCase()}`)
        .join(', ')}`,
    );
  }
  if (def.output) {
    parts.push(
      `produz ${Object.entries(def.output)
        .map(([k, v]) => `${v} ${RESOURCE_LABEL[k as keyof ResourceBag].toLowerCase()}`)
        .join(', ')}`,
    );
  }
  if (def.housing) parts.push(`+${def.housing} moradia`);
  if (def.storage) parts.push(`+${def.storage} estoque`);
  if (def.enablesRecruit) parts.push('permite recrutar');
  return parts.join(' · ') || def.description;
}

// --------------------------------------------------------------- Militar ----

function ArmyTab({
  game,
  state,
  territory,
  wallet,
}: {
  game: Game;
  state: GameState;
  territory: Territory;
  wallet: ResourceBag;
}) {
  const barracks = game.armies.barracksLevel(territory);
  const garrison = game.armies.garrisonOf(territory.id);
  const orders = state.training.filter((o) => o.territoryId === territory.id);

  // Composição da expedição, escolhida pelo jogador.
  const [expedition, setExpedition] = useState<UnitStack>({});
  const [targetId, setTargetId] = useState<string | null>(null);

  // Trocar de território zera a coluna sendo montada.
  useEffect(() => {
    setExpedition({});
    setTargetId(null);
  }, [territory.id]);

  const sending = Object.values(expedition).reduce((a, n) => a + (n ?? 0), 0);
  const targets = territory.neighbors
    .map((id) => state.territories[id])
    .filter((t): t is Territory => Boolean(t) && !t.locked && t.ownerId !== territory.ownerId);

  const march = targetId ? game.marchCheck(territory.id, targetId, expedition) : null;
  const preview =
    targetId && sending > 0
      ? game.battlePreview(expedition, garrison?.morale ?? 60, targetId)
      : null;

  const setUnit = (kind: UnitKind, value: number) => {
    setExpedition((prev) => {
      const next = { ...prev };
      if (value <= 0) delete next[kind];
      else next[kind] = value;
      return next;
    });
  };

  if (barracks <= 0 && !garrison) {
    return (
      <div className="empty">
        Sem Quartel neste território.
        <br />
        Construa um na aba <strong>CONSTRUIR</strong> para poder treinar tropas.
      </div>
    );
  }

  return (
    <>
      <div className="stat-grid">
        <div className="stat">
          <div className="k">Quartel</div>
          <div className="v">{barracks > 0 ? `Nv ${barracks}` : '—'}</div>
        </div>
        <div className="stat">
          <div className="k">Poder da guarnição</div>
          <div className="v">{game.armies.power(garrison)}</div>
        </div>
      </div>

      {orders.length > 0 && (
        <>
          <div className="section-title">Em treinamento</div>
          {orders.map((o) => (
            <div className="row busy" key={o.id}>
              <div className="grow">
                <span className="name">{UNIT_DEFS[o.unit].name}</span>
                <span className="meta">{Math.ceil(o.remaining)}s restantes</span>
                <div className="bar">
                  <i style={{ width: `${(1 - o.remaining / o.total) * 100}%`, background: '#4bd07f' }} />
                </div>
              </div>
              <button className="btn sm danger" onClick={() => game.cancelTraining(o.id)}>
                ✕
              </button>
            </div>
          ))}
        </>
      )}

      {garrison && (
        <>
          <div className="section-title">
            {garrison.name} · moral {Math.round(garrison.morale)}
          </div>
          {(Object.entries(garrison.units) as [UnitKind, number][]).map(([kind, count]) => (
            <div className="row ok" key={kind}>
              <Thumb sprite={`units/${kind}`} fallback="⚔" />
              <div className="grow">
                <span className="name">
                  {UNIT_DEFS[kind].name} × {count}
                </span>
                <span className="meta">
                  atq {UNIT_DEFS[kind].attack} · def {UNIT_DEFS[kind].defense} · vel{' '}
                  {UNIT_DEFS[kind].speed}
                </span>
              </div>
              <button
                className="btn sm danger"
                title="Dispensar um"
                onClick={() => game.disband(territory.id, kind)}
              >
                −
              </button>
            </div>
          ))}
        </>
      )}

      {/* ---------------------------- campanha ---------------------------- */}
      {garrison && targets.length > 0 && (
        <>
          <div className="section-title">Campanha militar</div>
          <div className="target-row">
            {targets.map((t) => {
              const k = t.ownerId ? state.kingdoms[t.ownerId] : null;
              return (
                <button
                  key={t.id}
                  className={`target ${targetId === t.id ? 'active' : ''}`}
                  onClick={() => setTargetId(targetId === t.id ? null : t.id)}
                >
                  <span className="owner-dot" style={{ background: k?.color ?? '#b9c2cd' }} />
                  {t.name}
                </button>
              );
            })}
          </div>

          {targetId && (
            <>
              {(Object.entries(garrison.units) as [UnitKind, number][]).map(([kind, available]) => (
                <div className="row" key={`exp-${kind}`}>
                  <Thumb sprite={`units/${kind}`} fallback="⚔" />
                  <div className="grow">
                    <span className="name">{UNIT_DEFS[kind].name}</span>
                    <span className="meta">disponíveis: {available}</span>
                  </div>
                  <div className="stepper">
                    <button
                      onClick={() => setUnit(kind, (expedition[kind] ?? 0) - 1)}
                      disabled={(expedition[kind] ?? 0) <= 0}
                    >
                      −
                    </button>
                    <span className="n">{expedition[kind] ?? 0}</span>
                    <button
                      onClick={() => setUnit(kind, (expedition[kind] ?? 0) + 1)}
                      disabled={(expedition[kind] ?? 0) >= available}
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}

              <div className="actions" style={{ marginTop: 8 }}>
                <button
                  className="btn sm"
                  onClick={() => setExpedition({ ...garrison.units })}
                >
                  Mobilizar tudo ({Object.values(garrison.units).reduce((a, n) => a + (n ?? 0), 0)})
                </button>
              </div>

              {preview && march && (
                <div className={`forecast ${preview.winner === 'attacker' ? 'win' : 'lose'}`}>
                  <div className="verdict">
                    {preview.winner === 'attacker' ? 'Vitória provável' : 'Derrota provável'}
                  </div>
                  <div className="lines">
                    <span>
                      Suas perdas: <b>{preview.attackerLosses}</b> de {preview.attackerStart}
                    </span>
                    <span>
                      Perdas inimigas: <b>{preview.defenderLosses}</b> de {preview.defenderStart}
                    </span>
                    <span>
                      Poder {preview.attackerPower} × {preview.defenderPower}
                      {preview.wallHp > 0 ? ' · muralha de pé' : ''}
                    </span>
                    <span>
                      Viagem: <b>{Math.ceil(march.travelTime)}s</b> · mobilização{' '}
                      <b>{march.cost.coin}</b> ouro e <b>{march.cost.food}</b> comida
                    </span>
                  </div>
                  <div className="warn">
                    Vencer não é o mesmo que valer a pena: conte o que volta para casa.
                  </div>
                </div>
              )}

              <div className="actions">
                <button
                  className="btn primary wide"
                  disabled={!march?.ok || sending <= 0}
                  title={march?.reason}
                  onClick={() => {
                    if (game.dispatchArmy(territory.id, targetId, expedition)) {
                      setExpedition({});
                      setTargetId(null);
                    }
                  }}
                >
                  Marchar com {sending} soldados
                </button>
                {march && !march.ok && <div className="hint">{march.reason}</div>}
              </div>
            </>
          )}
        </>
      )}

      {barracks > 0 && (
        <>
          <div className="section-title">Recrutar</div>
          {UNIT_LIST.map((u) => {
            const check = game.armies.checkRecruit(territory, u.id);
            const locked = barracks < u.requiresBarracks;
            return (
              <div className="row" key={u.id}>
                <Thumb sprite={`units/${u.id}`} fallback="⚔" />
                <div className="grow">
                  <span className="name">{u.name}</span>
                  <span className="meta">
                    {locked ? `Exige Quartel Nv ${u.requiresBarracks}` : u.description}
                  </span>
                  <Cost cost={u.cost} have={wallet} />
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
          <div className="hint">
            Cada soldado sai da força de trabalho e custa manutenção por minuto. Exército grande sem
            economia atrás quebra o reino.
          </div>
        </>
      )}
    </>
  );
}

// -------------------------------------------------------------- Comércio ----

const TRADEABLE: ResourceKind[] = [
  'food',
  'wood',
  'stone',
  'ore',
  'goldOre',
  'planks',
  'bricks',
  'iron',
  'coin',
];

/**
 * Aba de comércio: excedente vira o que falta. A caravana cobra margem, leva
 * um teto por viagem e demora a voltar — é logística, não conversão infinita.
 */
function TradeTab({
  game,
  territory,
  wallet,
}: {
  game: Game;
  territory: Territory;
  wallet: ResourceBag;
}) {
  const [give, setGive] = useState<ResourceKind>('wood');
  const [receive, setReceive] = useState<ResourceKind>('food');
  const [amount, setAmount] = useState(50);

  const level = game.trade.marketLevel(territory);
  const quote = game.trade.quote(territory, give, amount, receive);

  if (level <= 0) {
    return (
      <div className="empty">
        Sem Mercado neste território.
        <br />
        Erga um na aba <strong>CONSTRUIR</strong> para abrir a região às caravanas.
      </div>
    );
  }

  const maxByStock = Math.floor(wallet[give]);
  const maxByCaravan = Math.floor(quote.capacity / game.trade.valueOf(give));
  const max = Math.max(1, Math.min(maxByStock, maxByCaravan));

  return (
    <>
      <div className="stat-grid">
        <div className="stat">
          <div className="k">Mercado</div>
          <div className="v">Nv {level}</div>
        </div>
        <div className="stat">
          <div className="k">Margem da caravana</div>
          <div className="v">{Math.round(quote.spread * 100)}%</div>
        </div>
      </div>

      <div className="section-title">Oferecer</div>
      <div className="target-row">
        {TRADEABLE.filter((k) => k !== receive).map((k) => {
          const Icon = RESOURCE_ICON[k];
          return (
            <button
              key={`g-${k}`}
              className={`target ${give === k ? 'active' : ''}`}
              onClick={() => setGive(k)}
              title={RESOURCE_LABEL[k]}
            >
              <Icon />
              {Math.floor(wallet[k])}
            </button>
          );
        })}
      </div>

      <div className="row">
        <div className="grow">
          <span className="name">Quantidade</span>
          <span className="meta">
            até {max} · caravana leva {Math.round(quote.capacity)} de valor
          </span>
          <input
            className="slider"
            type="range"
            min={1}
            max={max}
            value={Math.min(amount, max)}
            onChange={(e) => setAmount(Number(e.target.value))}
          />
        </div>
        <span className="right">
          <span className="n">{Math.min(amount, max)}</span>
        </span>
      </div>

      <div className="section-title">Receber</div>
      <div className="target-row">
        {TRADEABLE.filter((k) => k !== give).map((k) => {
          const Icon = RESOURCE_ICON[k];
          return (
            <button
              key={`r-${k}`}
              className={`target ${receive === k ? 'active' : ''}`}
              onClick={() => setReceive(k)}
              title={RESOURCE_LABEL[k]}
            >
              <Icon />
              {Math.floor(wallet[k])}
            </button>
          );
        })}
      </div>

      <div className={`forecast ${quote.ok ? 'win' : 'lose'}`}>
        <div className="verdict">
          {Math.min(amount, max)} {RESOURCE_LABEL[give].toLowerCase()} →{' '}
          {quote.receiveAmount} {RESOURCE_LABEL[receive].toLowerCase()}
        </div>
        <div className="lines">
          <span>{quote.reason}</span>
        </div>
      </div>

      <div className="actions">
        <button
          className="btn gold wide"
          disabled={!quote.ok}
          onClick={() => game.executeTrade(territory.id, give, Math.min(amount, max), receive)}
        >
          {quote.cooldown > 0
            ? `Caravana volta em ${Math.ceil(quote.cooldown)}s`
            : 'Fechar negócio'}
        </button>
      </div>

      <div className="hint">
        O mercado troca pelo valor relativo de cada recurso. Evoluir o mercado
        reduz a margem e aumenta o que cabe em cada viagem.
      </div>
    </>
  );
}

// ------------------------------------------------------------- Fronteiras ----

function BordersTab({
  game,
  state,
  territory,
}: {
  game: Game;
  state: GameState;
  territory: Territory;
}) {
  return (
    <>
      <div className="hint" style={{ marginTop: 0 }}>
        Só é possível disputar território que faz <strong>fronteira</strong> com o seu domínio.
      </div>
      {territory.neighbors.map((nid) => {
        const n = state.territories[nid];
        if (!n) return null;
        const nk = n.ownerId ? state.kingdoms[n.ownerId] : null;
        const status = game.territories.claimStatus(state.playerKingdomId, nid);
        const offer = game.claimOffer(nid);
        return (
          <div className="row" key={nid}>
            <span className="owner-dot" style={{ background: nk?.color ?? '#b9c2cd' }} />
            <div className="grow">
              <span className="name">{n.name}</span>
              <span className="meta">
                {n.locked
                  ? n.lockReason
                  : nk
                    ? `${nk.name} · defesa ${n.defense}`
                    : `Neutro · defesa ${n.defense}`}
              </span>
            </div>
            <div className="stepper">
              <button
                className="btn sm"
                onClick={() => {
                  game.select(nid);
                  game.focusTerritory(nid, Math.max(game.camera.zoom, 0.75));
                }}
              >
                Ver
              </button>
              {offer.available && (
                <button
                  className="btn sm gold"
                  disabled={!offer.affordable}
                  title={offer.reason}
                  onClick={() => game.executeClaim(nid)}
                >
                  Tomar
                </button>
              )}
              {!offer.available && !status.claimable && (
                <span className="right" style={{ fontSize: 10 }}>
                  {n.locked ? '🔒' : 'sem fronteira'}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}
