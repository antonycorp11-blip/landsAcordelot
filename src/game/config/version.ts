/**
 * Identidade da build e montagem de URL de recurso.
 *
 * O problema: os sprites e o manifesto vivem em `public/` e são servidos com o
 * nome literal, sem hash. Um PWA já instalado guardaria a versão antiga para
 * sempre. A solução é carimbar cada requisição com o id da build — o navegador
 * indexa o cache pela URL inteira, então uma build nova nunca reaproveita o
 * arquivo velho.
 */

declare const __BUILD_ID__: string;

export const BUILD_ID: string =
  typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';

/** URL de um arquivo estático, já com o carimbo da build. */
export function assetUrl(path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  return `${clean}?v=${BUILD_ID}`;
}

/** Sprite do catálogo: `buildings/farm` -> `/assets/buildings/farm.webp?v=...` */
export function spriteUrl(key: string): string {
  return assetUrl(`/assets/${key}.webp`);
}
