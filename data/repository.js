// Écritures validées : charge l'état, valide avec core/entities.js, puis enregistre via store.
// Si la validation émet des avertissements, rien n'est enregistré tant que l'appelant n'a pas confirmé.
import { buildAccount, buildCategory, buildTransaction } from '../core/entities.js';
import { isMonthClosed } from '../core/month.js';
import { periodKeyOf } from '../core/dates.js';
import { newId } from '../core/types.js';

export const DEFAULT_CATEGORIES = {
  expense: ['Alimentation', 'Logement', 'Transport', 'Santé', 'Loisirs', 'Abonnements', 'Divers'],
  income: ['Salaire', 'Autres revenus'],
};

export function createRepository(store, { idFn = newId } = {}) {
  async function save(builder, storeName, input, { confirmWarnings = false } = {}) {
    const state = await store.loadState();
    const r = builder(input, state, { idFn });
    if (!r.ok) return r;
    if (r.warnings.length && !confirmWarnings) return { ok: false, needsConfirm: true, errors: [], warnings: r.warnings };
    await store.put(storeName, r.value);
    return r;
  }
  return {
    saveAccount: (input, opts) => save(buildAccount, 'accounts', input, opts),
    saveCategory: (input, opts) => save(buildCategory, 'categories', input, opts),
    saveTransaction: (input, opts) => save(buildTransaction, 'transactions', input, opts),
    setAccountActive: (id, active, opts) => save(buildAccount, 'accounts', { id, active }, opts),
    setCategoryActive: (id, active, opts) => save(buildCategory, 'categories', { id, active }, opts),
    async deleteTransaction(id) {
      const state = await store.loadState();
      const t = state.transactions.find((x) => x.id === id);
      if (!t) return { ok: false, errors: ['Opération introuvable'] };
      if (isMonthClosed(state, periodKeyOf(t.date))) return { ok: false, errors: ['Ce mois est clôturé : l’opération ne peut pas être supprimée'] };
      await store.remove('transactions', id);
      return { ok: true, errors: [] };
    },
    /** Ajoute les catégories usuelles qui n'existent pas encore. Renvoie le nombre ajouté. */
    async seedDefaultCategories() {
      const state = await store.loadState();
      const have = new Set(state.categories.map((c) => `${c.kind}:${c.name.toLowerCase()}`));
      const fresh = Object.entries(DEFAULT_CATEGORIES).flatMap(([kind, names]) => names
        .filter((name) => !have.has(`${kind}:${name.toLowerCase()}`)).map((name) => ({ id: idFn(), name, kind, active: true })));
      if (fresh.length) await store.putMany('categories', fresh);
      return fresh.length;
    },
  };
}
