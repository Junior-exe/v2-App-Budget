// Jeu de données de DÉMONSTRATION pour les tests de l'écran : fictif, dates relatives à aujourd'hui.
// Les opérations récurrentes passent par le vrai core (generatePlanned).
import { emptyState, defaultSavingsPlan } from '../core/types.js';
import { addMonths, dateInMonth, periodKeyOf } from '../core/dates.js';
import { generatePlanned } from '../core/recurrence.js';

export function demoState(today) {
  const cur = periodKeyOf(today), prev = addMonths(cur, -1), day = Number(today.slice(8));
  let n = 0; const id = (p) => `demo-${p}-${++n}`;
  const acc = (key, name, type, isSavings, open, order) => ({ id: `demo-${key}`, name, type, isSavings,
    openingBalanceCents: open, openingDate: `${prev}-01`, active: true, order });
  const cat = (key, name, kind = 'expense') => ({ id: `demo-${key}`, name, kind, active: true });
  const rule = (key, name, kind, cents, d, c) => ({ id: `demo-rule-${key}`, name, kind, amountCents: cents, frequency: 'monthly',
    day: d, accountId: 'demo-cc', categoryId: `demo-${c}`, startDate: `${prev}-01`, endDate: null, active: true });
  const rules = [rule('sal', 'Salaire', 'income', 190000, 28, 'sal'), rule('loy', 'Loyer', 'fixed_expense', 70000, 1, 'log'),
    rule('ass', 'Assurance', 'fixed_expense', 4200, 15, 'ass'), rule('tel', 'Téléphone', 'fixed_expense', 2000, 10, 'tel')];
  const txs = [];
  for (const key of [prev, cur]) for (const t of generatePlanned(rules, txs, key, () => id('r'))) txs.push({ ...t, status: t.date <= today ? 'done' : 'planned' });
  const date = (key, d) => dateInMonth(key, key === cur ? Math.min(d, day) : d);
  const exp = (key, d, cents, c, a, description) => txs.push({ id: id('e'), type: 'expense', date: date(key, d), amountCents: cents,
    status: 'done', accountId: `demo-${a}`, categoryId: `demo-${c}`, description });
  const tr = (key, d, cents, from, to) => txs.push({ id: id('t'), type: 'transfer', date: date(key, d), amountCents: cents,
    status: 'done', fromAccountId: `demo-${from}`, toAccountId: `demo-${to}`, categoryId: null, description: '' });
  exp(prev, 5, 14000, 'ali', 'cc', 'Courses'); exp(prev, 12, 9000, 'ali', 'cc', 'Courses'); exp(prev, 18, 3500, 'ani', 'esp', 'Croquettes');
  exp(prev, 20, 4500, 'loi', 'cc', 'Cinéma'); tr(prev, 6, 10000, 'cc', 'esp'); tr(prev, 29, 38000, 'cc', 'ep');
  exp(cur, 2, 14000, 'ali', 'cc', 'Courses'); exp(cur, 4, 3500, 'ani', 'esp', 'Croquettes'); exp(cur, 4, 3000, 'loi', 'cc', 'Sortie');
  tr(cur, 3, 10000, 'cc', 'esp');
  return { ...emptyState(),
    accounts: [acc('cc', 'Compte courant', 'checking', false, 150000, 0), acc('ep', 'Épargne bancaire', 'savings', true, 400000, 1),
      acc('esp', 'Espèces', 'cash', false, 5000, 2), acc('epl', 'Épargne liquide', 'cash', true, 50000, 3)],
    categories: [cat('sal', 'Salaire', 'income'), cat('log', 'Logement'), cat('ass', 'Assurance'), cat('tel', 'Téléphone'),
      cat('ali', 'Alimentation'), cat('ani', 'Animaux'), cat('loi', 'Loisirs'), cat('div', 'Divers')],
    transactions: txs, rules, savingsPlan: defaultSavingsPlan(),
    budgets: [['ali', 'Alimentation', 25000], ['ani', 'Animaux', 4000], ['div', 'Divers', 10000]]
      .map(([c, name, cents]) => ({ id: `demo-b-${c}`, name, monthlyCents: cents, categoryId: `demo-${c}`, active: true })) };
}
