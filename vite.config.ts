import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Id único por build. Vai para dentro do bundle e carimba a URL de todo
 * recurso estático, para PWA instalado nunca ficar preso em cache antigo.
 */
const buildId = Date.now().toString(36);

/**
 * Publica /build.json com o carimbo da build.
 *
 * Serve para responder, do celular e em um toque, "qual versão está no ar?" —
 * foi a pergunta que custou caro quando um vercel.json inválido derrubou os
 * deploys em silêncio e o site ficou parado numa versão antiga.
 */
function buildStamp() {
  return {
    name: 'build-stamp',
    generateBundle(this: { emitFile: (f: { type: 'asset'; fileName: string; source: string }) => void }) {
      this.emitFile({
        type: 'asset',
        fileName: 'build.json',
        source: JSON.stringify({ buildId, builtAt: new Date().toISOString() }, null, 2),
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), buildStamp()],
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
  },
  server: {
    port: 5173,
    open: false,
    // Aceita conexões da rede local: dá para abrir no celular pelo IP da máquina.
    host: true,
  },
});
