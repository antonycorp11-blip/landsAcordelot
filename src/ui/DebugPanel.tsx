import type { Game } from '../game/Game';
import { RESOURCE_KINDS } from '../game/types';

/** Ferramentas de desenvolvimento (§78). Só existe em modo dev. */
export function DebugPanel({ game, fps }: { game: Game; fps: number }) {
  return (
    <div className="debug">
      <h4>Debug</h4>
      <button
        onClick={() => {
          const k = game.playerKingdom;
          for (const r of RESOURCE_KINDS) k.resources[r] += 5000;
          game.notify('+5000 de cada recurso');
        }}
      >
        + Recursos
      </button>
      <button
        onClick={() => {
          for (const t of Object.values(game.state.territories)) {
            t.locked = false;
            t.lockReason = undefined;
          }
          game.notify('Todas as regiões desbloqueadas');
        }}
      >
        Revelar regiões
      </button>
      <button
        onClick={() => {
          const ok = game.revealNextWave();
          game.notify(ok ? 'Próxima onda do País revelada' : 'Nenhuma onda nova disponível');
        }}
      >
        Revelar onda do País
      </button>
      <button
        onClick={() => {
          if (game.selectedId) game.claimTerritory(game.selectedId, 'SCENARIO');
        }}
      >
        Forçar conquista
      </button>
      <button onClick={() => game.skipTutorial()}>Pular tutorial</button>
      <button onClick={() => game.saveNow()}>Salvar agora</button>
      <button onClick={() => game.resetSave()}>Apagar save</button>
      <div className="fps">{fps.toFixed(0)} fps</div>
    </div>
  );
}
