/**
 * Medida real do recorte da tela (notch, ilha dinâmica, barra inferior).
 *
 * Por que não usar `env()` direto no CSS: no PWA em standalone do iOS o
 * `env(safe-area-inset-*)` às vezes resolve como zero — depende de quando o
 * atalho foi criado na tela de início e de qual versão do WebKit está rodando.
 * O resultado é ícone embaixo do notch.
 *
 * Aqui a gente MEDE: um elemento sonda recebe o `env()` como padding e o valor
 * calculado é lido de volta. Se vier tudo zero num contexto onde deveria haver
 * recorte (app instalado, deitado, tela de toque), aplicamos um piso de
 * segurança. Assim funciona quando o `env()` funciona, e funciona quando não.
 */

/** Piso aplicado só quando a medição falha num contexto que deveria ter recorte. */
const FALLBACK_INSET = 44;

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone;
  return (
    iosStandalone === true ||
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    window.matchMedia?.('(display-mode: fullscreen)').matches === true
  );
}

function measure(): { top: number; right: number; bottom: number; left: number } {
  const probe = document.createElement('div');
  probe.style.cssText = [
    'position:fixed',
    'left:0',
    'top:0',
    'width:0',
    'height:0',
    'visibility:hidden',
    'pointer-events:none',
    'padding-top:env(safe-area-inset-top,0px)',
    'padding-right:env(safe-area-inset-right,0px)',
    'padding-bottom:env(safe-area-inset-bottom,0px)',
    'padding-left:env(safe-area-inset-left,0px)',
  ].join(';');
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const read = (v: string) => Math.round(parseFloat(v) || 0);
  const out = {
    top: read(cs.paddingTop),
    right: read(cs.paddingRight),
    bottom: read(cs.paddingBottom),
    left: read(cs.paddingLeft),
  };
  probe.remove();
  return out;
}

/**
 * Mede e publica `--safe-t/r/b/l` no elemento raiz, já em pixels.
 * O CSS passa a usar as variáveis; nenhum `env()` no caminho crítico.
 */
export function applySafeArea(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const inset = measure();

  const standalone = isStandalone();
  const landscape = window.innerWidth > window.innerHeight;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;

  // Julga os lados sozinhos: em paisagem o iOS reporta a barra inferior mesmo
  // quando falha em reportar o recorte lateral, e aí a soma total enganaria.
  const sidesMeasured = inset.left > 0 || inset.right > 0;

  // Só aparelho de tela alta tem recorte lateral. iPad e iPhone antes do X
  // têm proporção bem menor e não devem perder espaço à toa.
  const longSide = Math.max(window.screen.width, window.screen.height);
  const shortSide = Math.min(window.screen.width, window.screen.height);
  const notchLikely = shortSide > 0 && longSide / shortSide >= 1.95;

  // App instalado, deitado, tela alta de toque e lados zerados: o env() falhou.
  const needsFallback = standalone && landscape && coarse && notchLikely && !sidesMeasured;
  const side = needsFallback ? FALLBACK_INSET : 0;

  root.style.setProperty('--safe-t', `${inset.top}px`);
  root.style.setProperty('--safe-r', `${Math.max(inset.right, side)}px`);
  root.style.setProperty('--safe-b', `${inset.bottom}px`);
  root.style.setProperty('--safe-l', `${Math.max(inset.left, side)}px`);

  root.classList.toggle('standalone', standalone);
  root.classList.toggle('safe-fallback', needsFallback);

  safeAreaReport.top = inset.top;
  safeAreaReport.right = Math.max(inset.right, side);
  safeAreaReport.bottom = inset.bottom;
  safeAreaReport.left = Math.max(inset.left, side);
  safeAreaReport.standalone = standalone;
  safeAreaReport.fallback = needsFallback;
}

/** Último diagnóstico, exibido no painel de Ajuda para depurar no aparelho. */
export const safeAreaReport = {
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  standalone: false,
  fallback: false,
};

/** Liga a medição ao ciclo de vida da janela. Devolve a função de limpeza. */
export function watchSafeArea(): () => void {
  applySafeArea();
  // O iOS avisa antes de terminar a rotação: medimos de novo depois de assentar.
  let settle: number | undefined;
  const remeasure = () => {
    applySafeArea();
    window.clearTimeout(settle);
    settle = window.setTimeout(applySafeArea, 400);
  };
  window.addEventListener('resize', remeasure);
  window.addEventListener('orientationchange', remeasure);
  window.visualViewport?.addEventListener('resize', remeasure);
  return () => {
    window.clearTimeout(settle);
    window.removeEventListener('resize', remeasure);
    window.removeEventListener('orientationchange', remeasure);
    window.visualViewport?.removeEventListener('resize', remeasure);
  };
}
