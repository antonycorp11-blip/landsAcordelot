import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

/**
 * Save na nuvem (opcional).
 *
 * O jogo nasceu offline e continua offline: se não houver credencial, nada
 * aqui liga e tudo funciona como antes. A nuvem é uma terceira fonte de save
 * ao lado de IndexedDB e localStorage, obedecendo a mesma regra de sempre —
 * vence o carimbo mais novo.
 *
 * Também não existe muro de login. O jogador entra e joga; a sessão anônima
 * já sincroniza. O e-mail serve para *reivindicar* a conta e levar o reino
 * para outro aparelho, e é oferecido quando ele já tem algo a perder.
 */

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

let client: SupabaseClient | null = null;
let ready: Promise<User | null> | null = null;

export function cloudEnabled(): boolean {
  return Boolean(URL && ANON);
}

function db(): SupabaseClient | null {
  if (!cloudEnabled()) return null;
  if (!client) {
    client = createClient(URL!, ANON!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return client;
}

/**
 * Garante uma sessão utilizável, criando uma anônima na primeira vez.
 *
 * Devolve nulo quando a nuvem está desligada, offline, ou quando o projeto
 * não permite entrada anônima — e nesse caso o jogo simplesmente segue local.
 */
export function session(): Promise<User | null> {
  if (ready) return ready;
  ready = (async () => {
    const sb = db();
    if (!sb) return null;
    try {
      const { data } = await sb.auth.getSession();
      if (data.session?.user) return data.session.user;
      const { data: anon, error } = await sb.auth.signInAnonymously();
      if (error) return null;
      return anon.user ?? null;
    } catch {
      return null;
    }
  })();
  return ready;
}

export interface Account {
  id: string;
  email: string | null;
  /** Sessão anônima ainda não reivindicada por e-mail. */
  anonymous: boolean;
}

export async function account(): Promise<Account | null> {
  const user = await session();
  if (!user) return null;
  return {
    id: user.id,
    email: user.email ?? null,
    anonymous: !user.email,
  };
}

/**
 * Manda o link de acesso para o e-mail.
 *
 * Não guardamos senha em lugar nenhum: um link de uso único evita cadastro,
 * recuperação de senha e o risco de guardar credencial de jogador.
 */
export async function sendLoginLink(email: string): Promise<{ ok: boolean; message: string }> {
  const sb = db();
  if (!sb) return { ok: false, message: 'A nuvem não está configurada.' };
  try {
    const { error } = await sb.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) return { ok: false, message: error.message };
    return { ok: true, message: `Link enviado para ${email.trim()}. Abra no mesmo aparelho.` };
  } catch {
    return { ok: false, message: 'Não foi possível falar com o servidor.' };
  }
}

export async function signOut(): Promise<void> {
  const sb = db();
  if (!sb) return;
  try {
    await sb.auth.signOut();
  } finally {
    ready = null;
  }
}

/** Lê o save guardado na nuvem, ou nulo se não houver (ou se estiver offline). */
export async function readCloud(): Promise<string | null> {
  const sb = db();
  const user = await session();
  if (!sb || !user) return null;
  try {
    const { data, error } = await sb
      .from('saves')
      .select('payload')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error || !data?.payload) return null;
    return JSON.stringify(data.payload);
  } catch {
    return null;
  }
}

/**
 * Grava, mas só se for mais novo que o que já está lá.
 *
 * A comparação acontece no servidor porque dois aparelhos abertos ao mesmo
 * tempo não enxergam um ao outro. Devolve o carimbo que ficou valendo.
 */
export async function writeCloud(payload: string): Promise<number | null> {
  const sb = db();
  const user = await session();
  if (!sb || !user) return null;
  try {
    const parsed = JSON.parse(payload) as { savedAt?: number };
    const savedAt = typeof parsed.savedAt === 'number' ? parsed.savedAt : Date.now();
    const { data, error } = await sb.rpc('save_if_newer', {
      p_payload: parsed,
      p_saved_at: savedAt,
    });
    if (error) return null;
    return typeof data === 'number' ? data : savedAt;
  } catch {
    return null;
  }
}
