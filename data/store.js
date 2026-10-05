// Stockage IndexedDB. Seule couche qui touche au navigateur. Les soldes ne sont jamais stockés.
import { emptyState } from '../core/types.js';

export const DB_NAME = 'budget-perso';
export const DB_VERSION = 1; // version de la STRUCTURE IndexedDB (indépendante de la version du format de sauvegarde)
const KEYS = { accounts: 'id', categories: 'id', transactions: 'id', rules: 'id', budgets: 'id', closures: 'monthKey', meta: 'key' };
export const STORES = Object.keys(KEYS);

const wrap = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const finished = (tx) => new Promise((res, rej) => {
  tx.oncomplete = () => res();
  tx.onerror = () => rej(tx.error);
  tx.onabort = () => rej(tx.error ?? new Error('Transaction annulée'));
});

export function openStore(idb = globalThis.indexedDB, name = DB_NAME) {
  return new Promise((resolve, reject) => {
    const req = idb.open(name, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [s, k] of Object.entries(KEYS)) {
        if (db.objectStoreNames.contains(s)) continue;
        const os = db.createObjectStore(s, { keyPath: k });
        if (s === 'transactions') os.createIndex('date', 'date');
      }
    };
    req.onsuccess = () => resolve(makeStore(req.result));
    req.onerror = () => reject(req.error);
  });
}

function makeStore(db) {
  /** Exécute des écritures dans UNE transaction ; la moindre erreur l'annule entièrement. */
  async function write(storeNames, fn) {
    const tx = db.transaction(storeNames, 'readwrite');
    const done = finished(tx);
    try { fn(tx); } catch (e) { tx.abort(); await done.catch(() => {}); throw e; }
    await done;
  }
  const getMeta = async (key) => (await wrap(db.transaction('meta').objectStore('meta').get(key)))?.value ?? null;
  return {
    async loadState() {
      const tx = db.transaction(STORES, 'readonly');
      const all = Object.fromEntries(await Promise.all(STORES.map(async (s) => [s, await wrap(tx.objectStore(s).getAll())])));
      const meta = new Map(all.meta.map((m) => [m.key, m.value]));
      const base = emptyState();
      return { ...base, accounts: all.accounts, categories: all.categories, transactions: all.transactions,
        rules: all.rules, budgets: all.budgets, closures: all.closures,
        savingsPlan: meta.get('savingsPlan') ?? null, settings: meta.get('settings') ?? base.settings };
    },
    put: (store, record) => write([store], (tx) => tx.objectStore(store).put(record)),
    putMany: (store, records) => write([store], (tx) => records.forEach((r) => tx.objectStore(store).put(r))),
    remove: (store, key) => write([store], (tx) => tx.objectStore(store).delete(key)),
    setMeta: (key, value) => write(['meta'], (tx) => tx.objectStore('meta').put({ key, value })),
    getMeta,
    saveSavingsPlan(plan) { return plan ? this.setMeta('savingsPlan', plan) : write(['meta'], (tx) => tx.objectStore('meta').delete('savingsPlan')); },
    saveSettings: (settings) => write(['meta'], (tx) => tx.objectStore('meta').put({ key: 'settings', value: settings })),
    /** Remplacement complet, atomique : en cas d'erreur, les anciennes données restent intactes. */
    replaceAll: (state) => write(STORES, (tx) => {
      for (const s of STORES.filter((x) => x !== 'meta')) {
        const os = tx.objectStore(s); os.clear(); state[s].forEach((r) => os.put(r));
      }
      const meta = tx.objectStore('meta');
      meta.delete('savingsPlan'); meta.delete('settings');
      if (state.savingsPlan) meta.put({ key: 'savingsPlan', value: state.savingsPlan });
      meta.put({ key: 'settings', value: state.settings });
    }),
    markBackupDone(now = new Date().toISOString()) { return this.setMeta('lastBackupAt', now); },
    lastBackupAt: () => getMeta('lastBackupAt'),
    close: () => db.close(),
  };
}

/** Demande au navigateur de ne pas effacer les données. Accordé selon l'usage / l'installation en PWA. */
export async function requestPersistentStorage(storage = globalThis.navigator?.storage) {
  if (!storage?.persist) return { supported: false, persisted: false };
  const already = storage.persisted ? await storage.persisted() : false;
  return { supported: true, persisted: already || (await storage.persist()) };
}
