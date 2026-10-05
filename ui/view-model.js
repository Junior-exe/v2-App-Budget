// Transforme les résultats du core en données d'affichage. Aucune formule ici : uniquement des lectures.
import { computeBalances } from '../core/balances.js';
import { computeMonth, suggestExtraSavings } from '../core/month.js';
import { addMonths } from '../core/dates.js';

const pad = (n) => String(n).padStart(2, '0');
export const todayLocal = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function monthLabel(key) {
  const s = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${key}-01T00:00:00Z`));
  return s[0].toUpperCase() + s.slice(1);
}

export function buildDashboard(state, monthKey) {
  const m = computeMonth(state, monthKey);
  const bal = computeBalances(state.accounts, state.transactions);
  const sug = suggestExtraSavings(state, monthKey);
  const closure = state.closures.find((c) => c.monthKey === monthKey) ?? null;
  const sum = (xs) => xs.reduce((s, x) => s + x, 0);
  return {
    monthKey, label: monthLabel(monthKey), prevKey: addMonths(monthKey, -1), nextKey: addMonths(monthKey, 1), closed: m.closed,
    accounts: state.accounts.filter((a) => a.active).sort((a, b) => a.order - b.order)
      .map((a) => ({ id: a.id, name: a.name, isSavings: a.isSavings, balanceCents: bal.byAccount[a.id] })),
    totalCents: bal.totalCents,
    position: { ...m.free.position, plannedIncomeCents: m.income.plannedRemainingCents },
    month: { receivedCents: m.income.receivedCents, plannedIncomeCents: m.income.plannedRemainingCents,
      fixedCents: m.fixed.totalCents, budgetsSpentCents: sum(m.budgets.lines.map((l) => l.spentCents)),
      budgetsReservedCents: m.budgets.reservedCents, overrunCents: m.budgets.overrunCents, freeSpentCents: m.freeSpentCents },
    savings: { plannedCents: m.savings.plannedCents, netTransferredCents: m.savings.netTransferredCents,
      withdrawnCents: m.savings.withdrawnCents, extraConfirmed: closure !== null,
      extraCents: closure ? closure.extraSavingsCents : sug.fromFreeCents, unspentBudgetsCents: sug.fromUnspentBudgetsCents },
    toCommit: m.toCommit,
  };
}

// ---- Écrans de gestion : lectures seulement (les soldes viennent de computeBalances) ----
const byOrder = (a, b) => a.order - b.order;
const byName = (a, b) => a.name.localeCompare(b.name, 'fr');

export function buildAccountsScreen(state) {
  const bal = computeBalances(state.accounts, state.transactions);
  const row = (a) => ({ id: a.id, name: a.name, type: a.type, isSavings: a.isSavings, active: a.active,
    balanceCents: bal.byAccount[a.id], openingDate: a.openingDate });
  const sorted = [...state.accounts].sort(byOrder);
  return { active: sorted.filter((a) => a.active).map(row), inactive: sorted.filter((a) => !a.active).map(row), totalCents: bal.totalCents };
}

export function buildCategoriesScreen(state) {
  const g = (kind, active) => state.categories.filter((c) => c.kind === kind && c.active === active).sort(byName);
  return { expense: { active: g('expense', true), inactive: g('expense', false) }, income: { active: g('income', true), inactive: g('income', false) } };
}

export const buildMoreScreen = (state) => ({ categories: state.categories.filter((c) => c.active).length });

const TYPE_LABEL = { expense: 'Dépense', income: 'Revenu', transfer: 'Transfert' };
export function buildTransactionsScreen(state, monthKey) {
  const acc = new Map(state.accounts.map((a) => [a.id, a.name])), cat = new Map(state.categories.map((c) => [c.id, c.name]));
  const items = state.transactions.filter((t) => t.date.slice(0, 7) === monthKey)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
    .map((t) => {
      const where = t.type === 'transfer' ? `${acc.get(t.fromAccountId) ?? '?'} → ${acc.get(t.toAccountId) ?? '?'}` : (acc.get(t.accountId) ?? '?');
      const c = t.categoryId ? cat.get(t.categoryId) : null;
      return { id: t.id, type: t.type, status: t.status, date: t.date, amountCents: t.amountCents,
        title: t.description || c || TYPE_LABEL[t.type], subtitle: t.description && c ? `${c} · ${where}` : where };
    });
  return { monthKey, label: monthLabel(monthKey), prevKey: addMonths(monthKey, -1), nextKey: addMonths(monthKey, 1), items };
}
