// QUE puis-je dépenser : budget du mois, argent libre, épargne, reste à engager, clôture.
// Fonctions pures : elles ne modifient jamais leurs arguments.
import { periodKeyOf } from './dates.js';
import { assertCents, percentOfCents } from './money.js';

const sum = (xs) => xs.reduce((s, x) => s + x, 0);
const amounts = (ts) => sum(ts.map((t) => t.amountCents));

export const isMonthClosed = (state, key) => state.closures.some((c) => c.monthKey === key);

/** Épargne programmée (théorique) à partir du plan et des revenus du mois. */
export function plannedSavingsCents(plan, projectedCents, receivedCents) {
  if (!plan || !plan.active) return 0;
  if (plan.mode === 'fixed') return plan.fixedCents;
  const base = plan.base === 'projected' ? projectedCents : receivedCents; // défaut MVP : revenu reçu
  return percentOfCents(Math.max(0, base), plan.basisPoints);
}

export function computeMonth(state, key) {
  const txs = state.transactions.filter((t) => periodKeyOf(t.date) === key);
  const done = (t) => t.status === 'done';
  const accById = new Map(state.accounts.map((a) => [a.id, a]));
  const isSav = (id) => accById.get(id)?.isSavings === true;

  // Revenus : reçu / prévu restant / projeté
  const incomes = txs.filter((t) => t.type === 'income');
  const receivedCents = amounts(incomes.filter(done));
  const plannedRemainingCents = amounts(incomes.filter((t) => !done(t)));
  const projectedCents = receivedCents + plannedRemainingCents;

  // Charges fixes : dépenses issues d'une règle
  const fixed = txs.filter((t) => t.type === 'expense' && t.ruleId);
  const fixedDoneCents = amounts(fixed.filter(done));
  const fixedItems = fixed.filter((t) => !done(t)).map(({ id, date, amountCents, description, categoryId }) =>
    ({ id, date, amountCents, description, categoryId }));
  const fixedRemainingCents = sum(fixedItems.map((i) => i.amountCents));
  const fixedCents = fixedDoneCents + fixedRemainingCents;

  // Budgets récurrents : dépenses réalisées, hors charges fixes
  const budgets = state.budgets.filter((b) => b.active);
  const budgetedCats = new Set(budgets.map((b) => b.categoryId));
  const variable = txs.filter((t) => t.type === 'expense' && !t.ruleId && done(t));
  const lines = budgets.map((b) => {
    const spentCents = amounts(variable.filter((t) => t.categoryId === b.categoryId));
    return { budgetId: b.id, name: b.name, budgetCents: b.monthlyCents, spentCents,
      remainingCents: Math.max(0, b.monthlyCents - spentCents),
      overrunCents: Math.max(0, spentCents - b.monthlyCents) };
  });
  const reservedCents = sum(lines.map((l) => l.budgetCents));
  const overrunCents = sum(lines.map((l) => l.overrunCents));
  const unspentCents = sum(lines.map((l) => l.remainingCents));
  const freeSpentCents = amounts(variable.filter((t) => !budgetedCats.has(t.categoryId)));

  // Épargne : programmée / transférée nette (les transferts ne sont jamais des dépenses)
  const transfers = txs.filter((t) => t.type === 'transfer' && done(t));
  const transferredCents = amounts(transfers.filter((t) => !isSav(t.fromAccountId) && isSav(t.toAccountId)));
  const withdrawnCents = amounts(transfers.filter((t) => isSav(t.fromAccountId) && !isSav(t.toAccountId)));
  const netTransferredCents = transferredCents - withdrawnCents;
  const plan = state.savingsPlan;
  const savingsPlannedCents = plannedSavingsCents(plan, projectedCents, receivedCents);
  // Pour la projection, les revenus prévus généreront aussi de l'épargne (mode pourcentage)
  const savingsProjectedCents = plannedSavingsCents(plan && { ...plan, base: 'projected' }, projectedCents, receivedCents);
  const savingsRemainingCents = Math.max(0, savingsPlannedCents - netTransferredCents);

  // Argent libre : actuel = revenu REÇU uniquement ; projeté = après revenus prévus
  const spending = freeSpentCents + overrunCents;
  const commitments = fixedCents + savingsPlannedCents + reservedCents;
  const commitmentsProjected = fixedCents + savingsProjectedCents + reservedCents;
  const theoreticalCents = projectedCents - commitmentsProjected;
  const projectedFreeCents = theoreticalCents - spending;
  const currentFreeCents = receivedCents - commitments - spending; // peut être négatif (revenu pas encore versé)

  return {
    monthKey: key, closed: isMonthClosed(state, key),
    income: { receivedCents, plannedRemainingCents, projectedCents },
    fixed: { doneCents: fixedDoneCents, remainingCents: fixedRemainingCents, totalCents: fixedCents },
    budgets: { lines, reservedCents, overrunCents, unspentCents },
    freeSpentCents,
    expenses: { totalDoneCents: fixedDoneCents + amounts(variable) },
    savings: { plannedCents: savingsPlannedCents, plannedProjectedCents: savingsProjectedCents, transferredCents,
      withdrawnCents, netTransferredCents, remainingCents: savingsRemainingCents },
    free: {
      theoreticalCents, projectedCents: projectedFreeCents, currentCents: currentFreeCents,
      // Présentation pour l'interface : jamais de grosse valeur négative brute
      position: {
        availableNowCents: Math.max(0, currentFreeCents),            // disponible actuellement
        uncoveredCommitmentsCents: Math.max(0, -currentFreeCents),   // engagements pas encore couverts par le revenu reçu
        availableProjectedCents: projectedFreeCents,                 // disponible après les revenus prévus
      },
    },
    toCommit: { fixedItems, fixedCents: fixedRemainingCents, savingsCents: savingsRemainingCents,
      totalCents: fixedRemainingCents + savingsRemainingCents },
    pendingPlannedCount: txs.filter((t) => !done(t)).length,
  };
}

/** Montants que l'utilisateur PEUT choisir de confirmer : de simples suggestions, rien n'est appliqué. */
export function suggestExtraSavings(state, key) {
  const m = computeMonth(state, key);
  return { fromFreeCents: m.free.position.availableNowCents, fromUnspentBudgetsCents: m.budgets.unspentCents };
}

/**
 * Construit la clôture (à enregistrer par data/). Les deux montants d'épargne supplémentaire sont
 * OBLIGATOIRES et explicites : les budgets non dépensés ne deviennent jamais de l'épargne automatiquement.
 * Épargne réelle = épargne transférée nette + épargne supplémentaire confirmée.
 */
export function closeMonth(state, key, { extraFromFreeCents, extraFromUnspentBudgetsCents, now = null }) {
  if (isMonthClosed(state, key)) throw new Error(`Mois déjà clôturé : ${key}`);
  assertCents(extraFromFreeCents, 'épargne supplémentaire (argent libre)');
  assertCents(extraFromUnspentBudgetsCents, 'épargne supplémentaire (budgets non dépensés)');
  const m = computeMonth(state, key);
  const s = suggestExtraSavings(state, key);
  if (extraFromFreeCents < 0 || extraFromFreeCents > s.fromFreeCents)
    throw new RangeError('Épargne supplémentaire supérieure à l’argent libre disponible');
  if (extraFromUnspentBudgetsCents < 0 || extraFromUnspentBudgetsCents > s.fromUnspentBudgetsCents)
    throw new RangeError('Épargne supplémentaire supérieure aux budgets non dépensés');
  const extra = extraFromFreeCents + extraFromUnspentBudgetsCents;
  const real = m.savings.netTransferredCents + extra;
  const income = m.income.receivedCents;
  const plan = state.savingsPlan;
  const target = !plan || !plan.active ? null
    : plan.mode === 'percent' ? plan.basisPoints
    : income > 0 ? Math.round((m.savings.plannedCents * 10000) / income) : null;
  return {
    monthKey: key, closedAt: now ?? new Date().toISOString(),
    extraSavingsCents: extra, realSavingsCents: real,
    savingsRateBp: income > 0 ? Math.round((real * 10000) / income) : null,
    targetRateBp: target, pendingPlannedCount: m.pendingPlannedCount,
    snapshot: {
      incomeReceivedCents: income, fixedCents: m.fixed.doneCents, expensesCents: m.expenses.totalDoneCents,
      budgetsReservedCents: m.budgets.reservedCents,
      budgetsSpentCents: sum(m.budgets.lines.map((l) => l.spentCents)),
      overrunCents: m.budgets.overrunCents, freeSpentCents: m.freeSpentCents,
      savingsPlannedCents: m.savings.plannedCents, savingsTransferredCents: m.savings.transferredCents,
      savingsWithdrawnCents: m.savings.withdrawnCents, savingsNetTransferredCents: m.savings.netTransferredCents,
      extraFromFreeCents, extraFromUnspentBudgetsCents,
    },
  };
}
