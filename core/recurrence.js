// Les règles génèrent des opérations PRÉVUES (jamais réalisées). Fonction pure : renvoie les
// nouvelles opérations, c'est la couche data/ qui les enregistre. Idempotent (pas de doublon).
import { dateInMonth, periodKeyOf } from './dates.js';
import { newId } from './types.js';

export function generatePlanned(rules, transactions, monthKey, idFn = newId) {
  const out = [];
  for (const r of rules) {
    if (!r.active) continue;
    if (r.frequency !== 'monthly') throw new Error(`Fréquence non gérée : ${r.frequency}`);
    const date = dateInMonth(monthKey, r.day);
    if (date < r.startDate || (r.endDate && date > r.endDate)) continue;
    if (transactions.some((t) => t.ruleId === r.id && periodKeyOf(t.date) === monthKey)) continue;
    out.push({ id: idFn(), type: r.kind === 'income' ? 'income' : 'expense', date,
      amountCents: r.amountCents, status: 'planned', accountId: r.accountId,
      categoryId: r.categoryId, description: r.name, ruleId: r.id });
  }
  return out;
}
