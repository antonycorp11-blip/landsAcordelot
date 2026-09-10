/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Projeto Supabase. Ausente = jogo roda só local, como sempre rodou. */
  readonly VITE_SUPABASE_URL?: string;
  /** Chave publicável. Vai no bundle de propósito; quem protege é o RLS. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __BUILD_ID__: string;
