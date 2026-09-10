import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Id único por build. Vai para dentro do bundle e carimba a URL de todo
 * recurso estático, para PWA instalado nunca ficar preso em cache antigo.
 */
const buildId = Date.now().toString(36);

export default defineConfig({
  plugins: [react()],
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
