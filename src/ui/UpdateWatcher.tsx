import { useEffect, useState } from 'react';

/**
 * Detector de nova versão publicada.
 *
 * Não usamos service worker de propósito: um SW mal configurado é a causa mais
 * comum de PWA travado numa versão velha. Em vez disso, relemos o `index.html`
 * ignorando cache e comparamos o bundle que ele aponta com o que está rodando.
 * Se mudou, avisamos e recarregamos limpando o que der para limpar.
 */

const CHECK_INTERVAL_MS = 120_000;

function currentBundle(): string | null {
  const scripts = [...document.querySelectorAll<HTMLScriptElement>('script[type="module"][src]')];
  const entry = scripts.map((s) => s.getAttribute('src') ?? '').find((src) => src.includes('/assets/'));
  return entry ?? null;
}

async function publishedBundle(): Promise<string | null> {
  const res = await fetch(`/index.html?check=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) return null;
  const html = await res.text();
  const match = html.match(/src="(\/assets\/[^"]+\.js)"/);
  return match ? match[1] : null;
}

async function hardReload() {
  // Limpa o que estiver ao alcance antes de recarregar.
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    /* sem Cache Storage: seguimos assim mesmo */
  }
  try {
    const regs = await navigator.serviceWorker?.getRegistrations?.();
    await Promise.all((regs ?? []).map((r) => r.unregister()));
  } catch {
    /* idem */
  }
  window.location.replace(`${window.location.pathname}?r=${Date.now()}`);
}

export function UpdateWatcher() {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    // Em desenvolvimento o bundle é servido pelo Vite: nada a vigiar.
    const running = currentBundle();
    if (!running) return;

    let alive = true;
    const check = async () => {
      if (document.hidden) return;
      try {
        const published = await publishedBundle();
        if (alive && published && published !== running) setAvailable(true);
      } catch {
        /* offline ou deploy em andamento: tenta de novo depois */
      }
    };

    void check();
    const id = window.setInterval(check, CHECK_INTERVAL_MS);
    // Voltar para o app é o melhor momento para checar.
    document.addEventListener('visibilitychange', check);
    return () => {
      alive = false;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);

  if (!available) return null;

  return (
    <div className="update-bar">
      <span>Nova versão do reino disponível.</span>
      <button className="btn sm gold" onClick={() => void hardReload()}>
        Atualizar
      </button>
    </div>
  );
}
