import { useEffect, useState } from 'react';
import { spriteUrl } from '../game/config/version';
import type { Game } from '../game/Game';
import { UNIT_DEFS } from '../game/data/defs';
import type { UnitStack } from '../game/managers/ArmyManager';
import type { GameState, UnitKind } from '../game/types';

function total(units: UnitStack): number {
  return Object.values(units).reduce((a: number, n) => a + (n ?? 0), 0);
}

/**
 * "Quantos enviar", na hora do movimento.
 *
 * Aparece quando o jogador arrasta um exército até um destino aceso. Não é
 * um painel de gestão: é a decisão do momento — quanto vai, quanto fica, e
 * o que se espera encontrar do outro lado.
 */
export function SendTroops({
  game,
  state,
  armyId,
  targetId,
  onClose,
}: {
  game: Game;
  state: GameState;
  armyId: string;
  targetId: string;
  onClose: () => void;
}) {
  const army = state.armies[armyId];
  const target = state.territories[targetId];
  const [picked, setPicked] = useState<UnitStack>({});

  // Começa com tudo: mandar a coluna inteira é o caso comum.
  useEffect(() => {
    if (army) setPicked({ ...army.units });
  }, [armyId, targetId]);

  if (!army || !target) return null;

  const friendly = target.ownerId === state.playerKingdomId;
  const sending = total(picked);
  const march = game.marchCheck(army.territoryId, targetId, picked);
  const preview =
    !friendly && sending > 0 ? game.battlePreview(picked, army.morale, targetId) : null;

  const setUnit = (kind: UnitKind, value: number) => {
    setPicked((prev) => {
      const next = { ...prev };
      if (value <= 0) delete next[kind];
      else next[kind] = value;
      return next;
    });
  };

  const kingdom = target.ownerId ? state.kingdoms[target.ownerId] : null;

  return (
    <div className="panel send-panel">
      <div className="panel-head">
        <span className="owner-dot" style={{ background: kingdom?.color ?? '#b9c2cd' }} />
        <div className="grow">
          <div className="title">{friendly ? 'Reforçar' : 'Atacar'} {target.name}</div>
          <div className="sub">
            {friendly ? 'Juntar-se à guarnição' : kingdom ? kingdom.name : 'Território neutro'}
          </div>
        </div>
        <button className="close" onClick={onClose}>
          ×
        </button>
      </div>

      <div className="panel-body">
        {(Object.entries(army.units) as [UnitKind, number][]).map(([kind, have]) => (
          <div className="row" key={kind}>
            <img className="thumb" src={spriteUrl(`units/${kind}`)} alt="" />
            <div className="grow">
              <span className="name">{UNIT_DEFS[kind].name}</span>
              <span className="meta">
                {picked[kind] ?? 0} de {have} · ficam {have - (picked[kind] ?? 0)}
              </span>
            </div>
            <div className="stepper">
              <button
                onClick={() => setUnit(kind, (picked[kind] ?? 0) - 1)}
                disabled={(picked[kind] ?? 0) <= 0}
              >
                −
              </button>
              <span className="n">{picked[kind] ?? 0}</span>
              <button
                onClick={() => setUnit(kind, (picked[kind] ?? 0) + 1)}
                disabled={(picked[kind] ?? 0) >= have}
              >
                +
              </button>
            </div>
          </div>
        ))}

        <div className="batch" style={{ marginTop: 8 }}>
          <button className="batch-btn" onClick={() => setPicked({ ...army.units })}>
            Tudo
          </button>
          <button
            className="batch-btn"
            onClick={() => {
              const half: UnitStack = {};
              for (const k of Object.keys(army.units) as UnitKind[]) {
                const n = Math.floor((army.units[k] ?? 0) / 2);
                if (n > 0) half[k] = n;
              }
              setPicked(half);
            }}
          >
            Metade
          </button>
          <button className="batch-btn" onClick={() => setPicked({})}>
            Nenhum
          </button>
        </div>

        {friendly && sending > 0 && (
          <div className="forecast win">
            <div className="verdict">Reforço</div>
            <div className="lines">
              <span>
                {sending} soldados se juntam à guarnição de <b>{target.name}</b>
              </span>
              <span>
                Viagem <b>{Math.ceil(march.travelTime)}s</b> · mobilização{' '}
                <b>{march.cost.coin}</b> ouro e <b>{march.cost.food}</b> comida
              </span>
            </div>
          </div>
        )}

        {preview && (
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
                Viagem <b>{Math.ceil(march.travelTime)}s</b> · mobilização{' '}
                <b>{march.cost.coin}</b> ouro e <b>{march.cost.food}</b> comida
              </span>
            </div>
          </div>
        )}

        <div className="actions">
          <button
            className={`btn wide ${friendly ? 'primary' : 'gold'}`}
            disabled={!march.ok || sending <= 0}
            title={march.reason}
            onClick={() => {
              if (game.dispatchArmy(army.territoryId, targetId, picked)) {
                game.selectArmy(null);
                onClose();
              }
            }}
          >
            {friendly ? 'Enviar reforço' : 'Marchar'} com {sending} soldado
            {sending === 1 ? '' : 's'}
          </button>
          {!march.ok && <div className="hint">{march.reason}</div>}
        </div>
      </div>
    </div>
  );
}
