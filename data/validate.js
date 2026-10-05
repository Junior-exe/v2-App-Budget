// Contrôle d'intégrité d'un état complet (utilisé avant tout import). Renvoie la liste des erreurs.
import { isValidDate } from '../core/dates.js';
import { ACCOUNT_TYPES, TX_TYPES, TX_STATUS } from '../core/types.js';

const isId = (v) => typeof v === 'string' && v.length > 0;
const isCents = (v) => Number.isSafeInteger(v);

export function validateState(s) {
  const e = [];
  const err = (m) => e.push(m);
  if (!s || typeof s !== 'object') return ['Données absentes'];
  const list = (k) => (Array.isArray(s[k]) ? s[k] : (err(`${k} : liste manquante`), []));
  const accounts = list('accounts'), categories = list('categories'), txs = list('transactions'),
    rules = list('rules'), budgets = list('budgets'), closures = list('closures');
  const ids = (arr, key, label) => {
    const seen = new Set();
    for (const x of arr) {
      if (!isId(x?.[key])) err(`${label} : identifiant manquant`);
      else if (seen.has(x[key])) err(`${label} : identifiant en double (${x[key]})`);
      else seen.add(x[key]);
    }
    return seen;
  };
  const accIds = ids(accounts, 'id', 'compte'), catIds = ids(categories, 'id', 'catégorie');
  ids(txs, 'id', 'opération'); const ruleIds = ids(rules, 'id', 'règle'); ids(budgets, 'id', 'budget');
  ids(closures, 'monthKey', 'clôture');

  for (const a of accounts) {
    if (!ACCOUNT_TYPES.includes(a.type)) err(`compte ${a.id} : type invalide`);
    if (typeof a.isSavings !== 'boolean') err(`compte ${a.id} : isSavings manquant`);
    if (!isCents(a.openingBalanceCents)) err(`compte ${a.id} : solde initial invalide`);
    if (!isValidDate(a.openingDate)) err(`compte ${a.id} : date du solde initial invalide`);
  }
  for (const t of txs) {
    const w = `opération ${t.id}`;
    if (!TX_TYPES.includes(t.type)) err(`${w} : type invalide`);
    if (!TX_STATUS.includes(t.status)) err(`${w} : statut invalide`);
    if (!isValidDate(t.date)) err(`${w} : date invalide`);
    if (!isCents(t.amountCents) || t.amountCents <= 0) err(`${w} : montant invalide`);
    if (t.type === 'transfer') {
      if (!accIds.has(t.fromAccountId) || !accIds.has(t.toAccountId)) err(`${w} : compte de transfert inconnu`);
      else if (t.fromAccountId === t.toAccountId) err(`${w} : transfert vers le même compte`);
    } else if (!accIds.has(t.accountId)) err(`${w} : compte inconnu`);
    if (t.categoryId != null && !catIds.has(t.categoryId)) err(`${w} : catégorie inconnue`);
    if (t.ruleId != null && !ruleIds.has(t.ruleId)) err(`${w} : règle inconnue`);
  }
  for (const r of rules) {
    const w = `règle ${r.id}`;
    if (!['income', 'fixed_expense'].includes(r.kind)) err(`${w} : nature invalide`);
    if (r.frequency !== 'monthly') err(`${w} : fréquence non gérée`);
    if (!Number.isInteger(r.day) || r.day < 1 || r.day > 31) err(`${w} : jour invalide`);
    if (!isCents(r.amountCents) || r.amountCents <= 0) err(`${w} : montant invalide`);
    if (!accIds.has(r.accountId)) err(`${w} : compte inconnu`);
    if (r.categoryId != null && !catIds.has(r.categoryId)) err(`${w} : catégorie inconnue`);
    if (!isValidDate(r.startDate) || (r.endDate != null && !isValidDate(r.endDate))) err(`${w} : dates invalides`);
  }
  const budgetCats = new Set();
  for (const b of budgets) {
    if (!isCents(b.monthlyCents) || b.monthlyCents <= 0) err(`budget ${b.id} : montant invalide`);
    if (!catIds.has(b.categoryId)) err(`budget ${b.id} : catégorie inconnue`);
    if (b.active) { // un budget actif par catégorie (sinon double comptage)
      if (budgetCats.has(b.categoryId)) err(`budget ${b.id} : catégorie déjà utilisée par un autre budget actif`);
      budgetCats.add(b.categoryId);
    }
  }
  const p = s.savingsPlan;
  if (p != null) {
    if (!['percent', 'fixed'].includes(p.mode)) err('plan d’épargne : mode invalide');
    if (!Number.isInteger(p.basisPoints) || p.basisPoints < 0 || p.basisPoints > 10000) err('plan d’épargne : pourcentage invalide');
    if (!isCents(p.fixedCents) || p.fixedCents < 0) err('plan d’épargne : montant fixe invalide');
    if (!['received', 'projected'].includes(p.base)) err('plan d’épargne : base invalide');
  }
  for (const c of closures) if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(c.monthKey ?? '')) err(`clôture ${c.monthKey} : mois invalide`);
  if (s.settings?.startDay !== 1) err('paramètres : seul le mois civil (startDay = 1) est géré');
  return e;
}
