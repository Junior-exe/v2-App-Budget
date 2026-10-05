// Création / modification des comptes, catégories et opérations : validation et normalisation.
// Fonctions pures : (saisie brute, état) → { ok, value, errors, warnings }. Aucune écriture ici.
// Les montants arrivent en texte d'euros ("12,50") et sont convertis en centimes par money.js.
import { eurosToCents, formatCents } from './money.js';
import { isValidDate, periodKeyOf } from './dates.js';
import { computeBalances } from './balances.js';
import { isMonthClosed } from './month.js';
import { newId, ACCOUNT_TYPES, TX_TYPES, TX_STATUS } from './types.js';

const text = (v) => String(v ?? '').trim();
const bool = (v, d) => (v === undefined ? d : v === true || v === 'true' || v === 'on');
const fail = (errors) => ({ ok: false, errors, warnings: [] });
const done = (value, warnings = []) => ({ ok: true, value, errors: [], warnings });

function money(v, label, positive) {
  let c;
  try { c = eurosToCents(v); } catch { return { error: `${label} invalide` }; }
  return positive && c <= 0 ? { error: `${label} : doit être supérieur à 0` } : { c };
}

export function buildAccount(input, state, { idFn = newId } = {}) {
  const cur = input.id ? state.accounts.find((a) => a.id === input.id) : null;
  if (input.id && !cur) return fail(['Compte introuvable']);
  const errors = [], warnings = [];
  const name = text(input.name ?? cur?.name);
  if (!name) errors.push('Le nom est obligatoire');
  if (state.accounts.some((a) => a.id !== cur?.id && a.name.toLowerCase() === name.toLowerCase())) errors.push('Un compte porte déjà ce nom');
  const type = input.type ?? cur?.type ?? 'checking';
  if (!ACCOUNT_TYPES.includes(type)) errors.push('Type de compte invalide');
  const isSavings = bool(input.isSavings, cur?.isSavings ?? type === 'savings');
  let openingBalanceCents = cur?.openingBalanceCents ?? 0;
  if (input.openingBalance !== undefined) {
    const m = money(input.openingBalance, 'Solde initial', false);
    if (m.error) errors.push(m.error); else openingBalanceCents = m.c;
  }
  const openingDate = input.openingDate ?? cur?.openingDate;
  if (!isValidDate(openingDate)) errors.push('Date du solde initial invalide');
  const active = bool(input.active, cur?.active ?? true);
  if (errors.length) return fail(errors);
  if (cur) {
    const n = state.transactions.filter((t) => t.status === 'done' && t.date < openingDate &&
      [t.accountId, t.fromAccountId, t.toAccountId].includes(cur.id)).length;
    if (n && openingDate !== cur.openingDate) warnings.push(`${n} opération(s) antérieure(s) à cette date ne seront plus comptées dans le solde.`);
    if (cur.active && !active) {
      const b = computeBalances(state.accounts, state.transactions).byAccount[cur.id];
      if (b !== 0) warnings.push(`Le solde actuel (${formatCents(b)}) ne sera plus compté dans le total.`);
    }
  }
  const order = cur?.order ?? state.accounts.reduce((m, a) => Math.max(m, a.order), -1) + 1;
  return done({ id: cur?.id ?? idFn(), name, type, isSavings, openingBalanceCents, openingDate, active, order }, warnings);
}

export function buildCategory(input, state, { idFn = newId } = {}) {
  const cur = input.id ? state.categories.find((c) => c.id === input.id) : null;
  if (input.id && !cur) return fail(['Catégorie introuvable']);
  const errors = [];
  const name = text(input.name ?? cur?.name);
  const kind = input.kind ?? cur?.kind ?? 'expense';
  if (!name) errors.push('Le nom est obligatoire');
  if (!['expense', 'income'].includes(kind)) errors.push('Type de catégorie invalide');
  if (cur && kind !== cur.kind) errors.push('Le type d’une catégorie ne peut pas être modifié');
  if (state.categories.some((c) => c.id !== cur?.id && c.kind === kind && c.name.toLowerCase() === name.toLowerCase()))
    errors.push('Une catégorie de ce type porte déjà ce nom');
  if (errors.length) return fail(errors);
  return done({ id: cur?.id ?? idFn(), name, kind, active: bool(input.active, cur?.active ?? true) });
}

/**
 * Opération : revenu / dépense (un compte + catégorie facultative) ou transfert (compte source → destination).
 * Un transfert n'a jamais de catégorie. Les mois clôturés sont protégés.
 */
export function buildTransaction(input, state, { idFn = newId } = {}) {
  const cur = input.id ? state.transactions.find((t) => t.id === input.id) : null;
  if (input.id && !cur) return fail(['Opération introuvable']);
  const errors = [], warnings = [];
  const type = input.type ?? cur?.type;
  if (!TX_TYPES.includes(type)) errors.push('Type d’opération invalide');
  const status = input.status ?? cur?.status ?? 'done';
  if (!TX_STATUS.includes(status)) errors.push('Statut invalide');
  const date = input.date ?? cur?.date;
  if (!isValidDate(date)) errors.push('Date invalide');
  let amountCents = cur?.amountCents;
  if (input.amount !== undefined) {
    const m = money(input.amount, 'Montant', true);
    if (m.error) errors.push(m.error); else amountCents = m.c;
  } else if (amountCents === undefined) errors.push('Montant manquant');

  const checkAccount = (id, previous) => {
    const a = state.accounts.find((x) => x.id === id);
    if (!a) return errors.push('Compte inconnu');
    if (!a.active && id !== previous) errors.push(`Le compte « ${a.name} » est désactivé`);
    if (status === 'done' && isValidDate(date) && date < a.openingDate)
      warnings.push(`Cette date précède le solde initial de « ${a.name} » : l’opération ne sera pas comptée dans son solde.`);
  };
  const value = { id: cur?.id ?? idFn(), type, date, amountCents, status, description: text(input.description ?? cur?.description), ruleId: cur?.ruleId ?? null };
  if (type === 'transfer') {
    const from = input.fromAccountId ?? cur?.fromAccountId, to = input.toAccountId ?? cur?.toAccountId;
    checkAccount(from, cur?.fromAccountId); checkAccount(to, cur?.toAccountId);
    if (from === to) errors.push('Le compte source et le compte destination doivent être différents');
    Object.assign(value, { fromAccountId: from, toAccountId: to, categoryId: null });
  } else if (type === 'income' || type === 'expense') {
    const accountId = input.accountId ?? cur?.accountId;
    checkAccount(accountId, cur?.accountId);
    const categoryId = input.categoryId === undefined ? (cur?.categoryId ?? null) : (input.categoryId || null);
    if (categoryId) {
      const c = state.categories.find((x) => x.id === categoryId);
      if (!c) errors.push('Catégorie inconnue');
      else if (c.kind !== type) errors.push(`La catégorie « ${c.name} » ne convient pas à ce type d’opération`);
      else if (!c.active && categoryId !== cur?.categoryId) errors.push(`La catégorie « ${c.name} » est désactivée`);
    }
    Object.assign(value, { accountId, categoryId });
  }
  const months = [date, cur?.date].filter((d) => d && isValidDate(d)).map((d) => periodKeyOf(d));
  if (months.some((k) => isMonthClosed(state, k))) errors.push('Ce mois est clôturé : l’opération ne peut pas être modifiée');
  return errors.length ? fail(errors) : done(value, warnings);
}
