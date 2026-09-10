import { useEffect, useState } from 'react';
import {
  account,
  cloudEnabled,
  sendLoginLink,
  signOut,
  type Account,
} from '../game/net/cloud';

/**
 * Conta e save na nuvem.
 *
 * Não é um muro de login. O jogador já está jogando quando chega aqui, e o
 * e-mail serve para uma coisa só: levar o reino para outro aparelho. Por isso
 * a tela mostra primeiro o que ele tem a ganhar, e nunca bloqueia nada.
 *
 * Sem credencial configurada, este bloco diz a verdade em uma linha em vez de
 * fingir um serviço que não existe.
 */
export function AccountPanel() {
  const [acc, setAcc] = useState<Account | null>(null);
  const [loading, setLoading] = useState(cloudEnabled());
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!cloudEnabled()) return;
    let alive = true;
    void account().then((a) => {
      if (!alive) return;
      setAcc(a);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!cloudEnabled()) {
    return (
      <div className="hint">
        <strong>Nuvem desligada.</strong> Seu reino está salvo neste aparelho, em duas cópias
        (IndexedDB e localStorage). Para sincronizar entre celular e computador, falta ligar o
        servidor.
      </div>
    );
  }

  if (loading) return <div className="hint">Falando com o servidor…</div>;

  if (!acc) {
    return (
      <div className="hint">
        <strong>Sem conexão com a nuvem.</strong> O jogo continua salvando neste aparelho
        normalmente; a sincronização volta sozinha quando a rede voltar.
      </div>
    );
  }

  const send = async () => {
    if (!email.trim()) return;
    setSending(true);
    const r = await sendLoginLink(email);
    setStatus(r.message);
    setSending(false);
  };

  return (
    <div className="account">
      <div className="acc-head">
        <span className={`acc-dot ${acc.anonymous ? 'anon' : 'ok'}`} />
        <div className="grow">
          <div className="acc-title">
            {acc.anonymous ? 'Reino guardado só neste aparelho' : acc.email}
          </div>
          <div className="acc-sub">
            {acc.anonymous
              ? 'Já está sincronizando, mas ninguém sabe que é seu. Um e-mail amarra a conta.'
              : 'Sincronizado. Entre com este e-mail em qualquer aparelho para continuar.'}
          </div>
        </div>
      </div>

      {acc.anonymous ? (
        <>
          <div className="acc-row">
            <input
              className="acc-input"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button className="btn primary" disabled={sending || !email.trim()} onClick={send}>
              {sending ? 'Enviando…' : 'Enviar link'}
            </button>
          </div>
          <div className="hint">
            Não existe senha. Chega um link de uso único no e-mail; abrir o link neste aparelho
            amarra o reino que já está aqui à sua conta.
          </div>
        </>
      ) : (
        <button
          className="btn"
          onClick={async () => {
            await signOut();
            setAcc(null);
            setStatus('Sessão encerrada. O reino continua salvo neste aparelho.');
          }}
        >
          Sair da conta
        </button>
      )}

      {status && <div className="acc-status">{status}</div>}
    </div>
  );
}
