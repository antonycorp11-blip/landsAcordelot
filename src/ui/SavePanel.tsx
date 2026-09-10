import { useState } from 'react';
import type { Game } from '../game/Game';

/**
 * Cópia de segurança do progresso.
 *
 * Mesmo com IndexedDB e armazenamento persistente, o navegador continua sendo
 * dono dos dados. Isto aqui deixa o jogador levar o reino embora: um texto que
 * pode ir para as notas, para um e-mail, para onde ele quiser.
 */
export function SaveTools({ game }: { game: Game }) {
  const [status, setStatus] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);
  const [text, setText] = useState('');

  const say = (msg: string) => {
    setStatus(msg);
    window.setTimeout(() => setStatus(null), 4000);
  };

  const copy = async () => {
    const data = game.saves.export(game.state);
    try {
      await navigator.clipboard.writeText(data);
      say('Reino copiado. Cole num lugar seguro.');
    } catch {
      setText(data);
      setPasting(true);
      say('Copie o texto abaixo manualmente.');
    }
  };

  const download = () => {
    const data = game.saves.export(game.state);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `acordelot-dia-${game.state.time.day}.json`;
    a.click();
    URL.revokeObjectURL(url);
    say('Arquivo gerado.');
  };

  const restore = () => {
    if (!text.trim()) {
      say('Cole o texto do save primeiro.');
      return;
    }
    if (!game.saves.importFrom(text.trim())) {
      say('Texto inválido — não parece um save.');
      return;
    }
    say('Save restaurado. Recarregando…');
    window.setTimeout(() => window.location.reload(), 900);
  };

  const saved = game.saves.lastSavedAt
    ? new Date(game.saves.lastSavedAt).toLocaleTimeString('pt-BR')
    : '—';

  return (
    <>
      <div className="hint" style={{ marginTop: 0 }}>
        Salvo automaticamente a cada 20 segundos, ao sair do jogo e a cada
        conquista. Último salvamento: <strong>{saved}</strong>.
        <br />
        Armazenamento durável:{' '}
        <strong>{game.saves.persistent ? 'concedido' : 'não concedido'}</strong>.
      </div>

      <div className="actions">
        <button className="btn wide" onClick={() => game.saveNow()}>
          Salvar agora
        </button>
        <div style={{ display: 'flex', gap: 7 }}>
          <button className="btn sm" style={{ flex: 1 }} onClick={() => void copy()}>
            Copiar reino
          </button>
          <button className="btn sm" style={{ flex: 1 }} onClick={download}>
            Baixar arquivo
          </button>
        </div>
        <button className="btn sm" onClick={() => setPasting((v) => !v)}>
          {pasting ? 'Fechar restauração' : 'Restaurar de um texto'}
        </button>
      </div>

      {pasting && (
        <>
          <textarea
            className="save-box"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Cole aqui o texto do reino salvo…"
            spellCheck={false}
          />
          <div className="actions">
            <button className="btn primary wide" onClick={restore}>
              Restaurar este reino
            </button>
          </div>
        </>
      )}

      {status && <div className="hint">{status}</div>}

      {game.saves.incompatibleFound && (
        <div className="hint" style={{ borderLeftColor: 'var(--gold)' }}>
          Havia um save de uma versão anterior do jogo. Ele foi <strong>arquivado</strong>,
          não apagado — mas o formato mudou e o reino recomeçou.
        </div>
      )}
    </>
  );
}
