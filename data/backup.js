// Sauvegarde versionnée : fichier JSON { app, schemaVersion, exportedAt, data }.
// Import = validation + migration + aperçu, puis REMPLACEMENT complet après confirmation (jamais de fusion).
import { SCHEMA_VERSION } from '../core/types.js';
import { validateState } from './validate.js';

export const BACKUP_APP = 'budget-perso';
/** Migrations de données : { 1: (data) => data version 2, ... } — vide tant que le schéma est en v1. */
export const MIGRATIONS = {};

export function buildBackup(state, now = new Date().toISOString()) {
  const data = structuredClone(state);
  data.settings = { ...data.settings, schemaVersion: SCHEMA_VERSION };
  return { app: BACKUP_APP, schemaVersion: SCHEMA_VERSION, exportedAt: now, data };
}

export const serializeBackup = (backup) => JSON.stringify(backup, null, 2);

export function migrateBackup(backup, { current = SCHEMA_VERSION, migrations = MIGRATIONS } = {}) {
  let v = backup.schemaVersion;
  if (!Number.isInteger(v) || v < 1) throw new Error('Version de sauvegarde invalide');
  if (v > current) throw new Error(`Sauvegarde créée par une version plus récente (v${v}) de l'application`);
  let data = structuredClone(backup.data);
  while (v < current) {
    if (!migrations[v]) throw new Error(`Migration v${v} → v${v + 1} manquante`);
    data = migrations[v](data);
    v += 1;
  }
  if (data && typeof data === 'object') data.settings = { ...data.settings, schemaVersion: current };
  return { ...backup, schemaVersion: current, data };
}

export function summarizeState(s) {
  const dates = s.transactions.map((t) => t.date).sort();
  return { accounts: s.accounts.length, categories: s.categories.length, transactions: s.transactions.length,
    rules: s.rules.length, budgets: s.budgets.length, closures: s.closures.length,
    firstDate: dates[0] ?? null, lastDate: dates.at(-1) ?? null };
}

/** Lit un fichier de sauvegarde sans rien modifier. Renvoie { ok, errors, summary?, state? }. */
export function prepareImport(text) {
  let backup;
  try { backup = JSON.parse(text); } catch { return { ok: false, errors: ['Fichier illisible : ce n’est pas un JSON valide'] }; }
  if (backup?.app !== BACKUP_APP || !backup.data) return { ok: false, errors: ['Ce fichier n’est pas une sauvegarde de cette application'] };
  let migrated;
  try { migrated = migrateBackup(backup); } catch (e) { return { ok: false, errors: [e.message] }; }
  const errors = validateState(migrated.data);
  if (errors.length) return { ok: false, errors };
  return { ok: true, errors: [], fromVersion: backup.schemaVersion, exportedAt: backup.exportedAt,
    summary: summarizeState(migrated.data), state: migrated.data };
}

/**
 * Applique un import préparé. Exige confirmed === true, et renvoie une sauvegarde de sécurité
 * (JSON) des données remplacées, à proposer en téléchargement.
 */
export async function applyImport(store, prepared, { confirmed = false, now } = {}) {
  if (!prepared?.ok) throw new Error('Import non valide');
  if (confirmed !== true) throw new Error('Confirmation explicite requise avant de remplacer les données');
  const safetyBackup = serializeBackup(buildBackup(await store.loadState(), now));
  await store.replaceAll(prepared.state);
  return { safetyBackup };
}

export const backupAgeDays = (lastIso, nowIso) =>
  lastIso ? Math.floor((Date.parse(nowIso) - Date.parse(lastIso)) / 86400000) : null;
