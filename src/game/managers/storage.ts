import { SAVE } from '../config/balance';
import { cloudEnabled, readCloud, writeCloud } from '../net/cloud';

/**
 * Camada de armazenamento do save.
 *
 * localStorage sozinho não basta num PWA: no iOS ele é apagado por inatividade
 * e some sem aviso. Aqui gravamos em IndexedDB (mais durável) e espelhamos em
 * localStorage; na leitura vence o registro mais recente dos três. Se um for
 * apagado, os outros reconstroem.
 *
 * A nuvem é a terceira fonte, e é opcional: sem credencial configurada ela
 * simplesmente não existe e o jogo segue exatamente como sempre seguiu. A
 * regra de desempate é a mesma para todas — vence o `savedAt` mais novo.
 */

const DB_NAME = 'acordelot';
const DB_VERSION = 1;
const STORE = 'saves';

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      // Safari em aba privada pode travar a abertura sem erro.
      setTimeout(() => resolve(null), 2500);
    } catch {
      resolve(null);
    }
  });
}

async function idbGet(key: string): Promise<string | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(typeof req.result === 'string' ? req.result : null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbSet(key: string, value: string): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
  } catch {
    /* nada a fazer */
  }
}

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function lsSet(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function lsRemove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* nada a fazer */
  }
}

function savedAtOf(raw: string | null): number {
  if (!raw) return -1;
  try {
    const v = (JSON.parse(raw) as { savedAt?: number }).savedAt;
    return typeof v === 'number' ? v : 0;
  } catch {
    return -1;
  }
}

/**
 * Só o save principal viaja para a nuvem.
 *
 * Reserva e arquivos de versões antigas são rede de segurança deste aparelho;
 * mandá-los para o servidor gastaria banda e criaria a chance de um deles
 * voltar por cima do progresso bom. A comparação é com a chave canônica, e
 * não por formato: a chave principal também termina em `:v4`, e uma regra por
 * sufixo excluiria justamente ela.
 */
function syncsToCloud(key: string): boolean {
  return cloudEnabled() && key === SAVE.key;
}

/** Lê de todas as fontes e devolve a mais recente. */
export async function readSave(key: string): Promise<string | null> {
  const local = await readLocal(key);
  if (!syncsToCloud(key)) return local;

  const remote = await readCloud();
  if (remote === null) return local;
  if (local === null) return remote;
  if (savedAtOf(remote) <= savedAtOf(local)) return local;

  // A nuvem trouxe algo mais novo — outro aparelho jogou. Desce para os
  // cofres locais na mesma hora, para o próximo boot não depender da rede.
  lsSet(key, remote);
  await idbSet(key, remote);
  return remote;
}

async function readLocal(key: string): Promise<string | null> {
  const [fromIdb, fromLs] = [await idbGet(key), lsGet(key)];
  if (fromIdb === null) return fromLs;
  if (fromLs === null) return fromIdb;
  return savedAtOf(fromIdb) >= savedAtOf(fromLs) ? fromIdb : fromLs;
}

/**
 * Grava nas fontes locais e, se houver, na nuvem. Devolve true quando ao menos
 * uma fonte local aceitou: perder a rede nunca pode ser perder o progresso.
 */
export async function writeSave(key: string, value: string): Promise<boolean> {
  const okLs = lsSet(key, value);
  const okIdb = await idbSet(key, value);
  if (syncsToCloud(key)) void writeCloud(value);
  return okLs || okIdb;
}

export async function removeSave(key: string): Promise<void> {
  lsRemove(key);
  await idbDelete(key);
}

/**
 * Pede ao navegador para não despejar o armazenamento por inatividade.
 * No iOS instalado costuma ser concedido sem prompt; no navegador comum pode
 * ser negado, e aí seguimos com o que der.
 */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* sem suporte */
  }
  return false;
}
