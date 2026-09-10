import { useState } from 'react';
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

/** O que está travando a produção, e por quê. */
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

function Row({
  kind,
  stock,
  cap,
  ledger,
  open,
  onToggle,
}: {
  kind: ResourceKind;
  stock: number;
  cap: number;
  ledger: ReturnType<Game['economy']['ledger']>[ResourceKind];
  open: boolean;
  onToggle: () => void;
}) {
  const Icon = RESOURCE_ICON[kind];
  const full = cap > 0 && stock >= cap - 1;
  const hasDetail = ledger.sources.length > 0 || ledger.sinks.length > 0;

  return (
    <div className={`led ${open ? 'open' : ''}`}>
      <button className="led-head" onClick={onToggle} disabled={!hasDetail}>
        <span className="ico">
          <Icon />
        </span>
        <span className="nm">{RESOURCE_LABEL[kind]}</span>
        <span className={`stock ${full ? 'full' : ''}`}>
          {Math.floor(stock)}
          {cap > 0 && <small> / {cap}</small>}
        </span>
        <span className="flow">
          {ledger.produced > 0.05 && <em className="pos">+{ledger.produced.toFixed(1)}</em>}
          {ledger.consumed > 0.05 && <em className="neg">−{ledger.consumed.toFixed(1)}</em>}
        </span>
        <span className={`net ${ledger.net < -0.05 ? 'neg' : ledger.net > 0.05 ? 'pos' : ''}`}>
          {ledger.net >= 0 ? '+' : ''}
          {ledger.net.toFixed(1)}
        </span>
        {hasDetail && <span className="chev">{open ? '▾' : '▸'}</span>}
      </button>

      {open && (
        <div className="led-detail">
          <div className="hint" style={{ margin: '0 0 7px' }}>
            {RESOURCE_HINT[kind]}
          </div>
          {ledger.sources.length > 0 && (
            <>
              <div className="led-cap">Entra</div>
              {ledger.sources.map((e) => (
                <div className="led-line" key={`s-${e.label}`}>
                  <span>{e.label}</span>
                  <em className="pos">+{e.amount.toFixed(1)}</em>
                </div>
              ))}
            </>
          )}
          {ledger.sinks.length > 0 && (
            <>
              <div className="led-cap">Sai</div>
              {ledger.sinks.map((e) => (
                <div className="led-line" key={`k-${e.label}`}>
                  <span>{e.label}</span>
                  <em className="neg">−{e.amount.toFixed(1)}</em>
                </div>
              ))}
            </>
          )}
          {full && (
            <div className="hint" style={{ borderLeftColor: 'var(--gold)', marginTop: 7 }}>
              Estoque cheio: o que passar disso é desperdiçado. Construa um Armazém.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Painel de Recursos — a razão do reino.
 *
 * Mostra o que sai do solo, o que sai das oficinas e, para cada recurso, de
 * onde vem e para onde vai. É aqui que se responde "por que a pedra não sobe?"
 * sem abrir prédio por prédio.
 */
export function EconomyPanel({
  game,
  state,
  onClose,
}: {
  game: Game;
  state: GameState;
  onClose: () => void;
}) {
  const [open, setOpen] = useState<ResourceKind | null>(null);
  const kingdom = state.kingdoms[state.playerKingdomId];
  const cap = Math.round(game.economy.kingdomStorage(kingdom.id));
  const ledger = game.economy.ledger(kingdom.id);
  const bottlenecks = findBottlenecks(game, state);

  const row = (k: ResourceKind) => (
    <Row
      key={k}
      kind={k}
      stock={kingdom.resources[k]}
      cap={cap}
      ledger={ledger[k]}
      open={open === k}
      onToggle={() => setOpen(open === k ? null : k)}
    />
  );

  return (
    <div className="panel econ-panel">
      <div className="panel-head">
        <div className="grow">
          <div className="title">Recursos do reino</div>
          <div className="sub">Origem e destino, por minuto</div>
        </div>
        <button className="close" onClick={onClose}>
          ×
        </button>
      </div>

      <div className="panel-body">
        <div className="section-title">Extraídos do solo</div>
        {RAW_RESOURCES.map(row)}

        <div className="section-title">Refinados nas oficinas</div>
        {REFINED_RESOURCES.map(row)}

        <div className="section-title">
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
              game.selectBuilding(b.buildingId);
              onClose();
            }}
          >
            <span className="nm">{b.label}</span>
            <span className="why">{b.reason}</span>
          </button>
        ))}

        <div className="hint">
          Toque em qualquer recurso para ver quem produz e quem consome. Saldo
          negativo quer dizer que as oficinas comem mais do que a extração entrega —
          contrate mais gente na extração ou evolua o prédio.
        </div>
      </div>
    </div>
  );
}
