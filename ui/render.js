// Affichage du tableau de bord. Chaque montant porte data-k (nom) et data-cents (valeur brute du core)
// et son texte est TOUJOURS formatCents(data-cents) : ce qu'on voit = ce que calcule le moteur.
import { formatCents } from '../core/money.js';

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const amt = (k, c, cls = '') => `<span class="amt ${cls}" data-k="${k}" data-cents="${c}">${formatCents(c)}</span>`;
const row = (label, k, c, cls = '') => `<div class="row ${cls}"><span>${label}</span>${amt(k, c)}</div>`;

export function renderDashboard(vm, ui = {}) {
  if (ui.empty) return `<header class="top"><h1>Budget</h1></header>
    <section class="card"><h2>Aucune donnée</h2><p class="note">Créez vos comptes, importez une sauvegarde, ou chargez des données de démonstration (fictives) pour tester l'écran.</p>
    <div class="actions"><button class="primary" data-act="go-accounts">Créer mes comptes</button><button data-act="import">Importer une sauvegarde</button><button data-act="demo">Données de démonstration</button></div></section>`;
  const { position: p, month: mo, savings: s, toCommit: c } = vm;
  const items = c.fixedItems.map((i) => `<div class="row sub"><span>${esc(i.description || 'Charge')} · ${esc(i.date.slice(8))}/${esc(i.date.slice(5, 7))}</span>${amt('toCommitItem:' + i.id, i.amountCents)}</div>`).join('');
  return `
  <header class="top"><button data-act="prev" aria-label="Mois précédent">‹</button><h1>${esc(vm.label)}</h1><button data-act="next" aria-label="Mois suivant">›</button></header>
  ${vm.closed ? '<p class="badge">Mois clôturé</p>' : ''}
  ${ui.isDemo ? '<div class="banner">Données de démonstration (fictives). <button data-act="clear-demo">Les effacer</button></div>' : ''}

  <div class="grid">
  <section class="card real"><p class="tag">SOLDE RÉEL</p><h2>Mes comptes</h2>
    ${vm.accounts.map((a) => row(esc(a.name) + (a.isSavings ? ' <span class="muted">(épargne)</span>' : ''), 'balance:' + a.id, a.balanceCents)).join('')}
    ${row('<strong>Total</strong>', 'total', vm.totalCents)}
    <p class="note">Ce que contiennent vos comptes aujourd'hui. Ce n'est pas la somme que vous pouvez dépenser.</p></section>

  <section class="card free"><p class="tag">ARGENT LIBRE</p><h2>Ce que vous pouvez dépenser</h2>
    <p class="big">${amt('availableNow', p.availableNowCents)}</p><p class="lbl">Disponible actuellement</p>
    ${row('Engagements restant à couvrir', 'uncovered', p.uncoveredCommitmentsCents, p.uncoveredCommitmentsCents ? '' : 'sub')}
    ${row('Disponible projeté après les revenus prévus', 'availableProjected', p.availableProjectedCents)}
    ${p.uncoveredCommitmentsCents > 0 ? `<p class="hint">Vos revenus prévus (${amt('plannedIncomeHint', p.plannedIncomeCents)}) ne sont pas encore reçus : les charges et l'épargne du mois ne sont pas encore couvertes.</p>` : ''}</section>

  <section class="card"><h2>Situation du mois</h2>
    ${row('Revenus reçus', 'received', mo.receivedCents)}
    ${row('Revenus prévus restants', 'plannedIncome', mo.plannedIncomeCents, 'sub')}
    ${row('Charges fixes', 'fixed', mo.fixedCents)}
    ${row(`Budgets dépensés (sur ${formatCents(mo.budgetsReservedCents)})`, 'budgetsSpent', mo.budgetsSpentCents)}
    ${mo.overrunCents ? row('Dépassements de budget', 'overrun', mo.overrunCents) : ''}
    ${row('Dépenses libres', 'freeSpent', mo.freeSpentCents)}</section>

  <section class="card"><h2>Épargne du mois</h2>
    ${row('Programmée', 'savingsPlanned', s.plannedCents)}
    ${row('Transférée (nette des retraits)', 'savingsNet', s.netTransferredCents)}
    ${row(s.extraConfirmed ? 'Supplémentaire confirmée' : 'Supplémentaire possible (non confirmée)', 'savingsExtra', s.extraCents)}
    ${!s.extraConfirmed && s.unspentBudgetsCents ? `<p class="note">+ ${amt('unspentBudgets', s.unspentBudgetsCents, 'muted')} de budgets non dépensés, à confirmer à la clôture.</p>` : ''}</section>

  <section class="card"><h2>Reste à engager</h2>
    ${row('Charges fixes à venir', 'toCommitFixed', c.fixedCents)}
    ${row('Épargne restant à transférer', 'toCommitSavings', c.savingsCents)}
    ${row('<strong>Total</strong>', 'toCommit', c.totalCents)}
    ${items ? `<details><summary>Détail des charges</summary>${items}</details>` : ''}</section>

  ${renderBackupCard(ui)}
  </div>`;
}

/** Carte de sauvegarde : affichée sur l'accueil et dans l'écran « Plus ». */
export function renderBackupCard(ui = {}) {
  const backup = ui.neverBackedUp ? 'Aucune sauvegarde effectuée.' : `Dernière sauvegarde : il y a ${ui.backupAge} jour(s).`;
  return `<section class="card"><h2>Mes données</h2>
    <p class="note">${backup}${ui.persisted === false ? ' Stockage non garanti : sauvegardez régulièrement.' : ''}</p>
    <div class="actions"><button data-act="export">Exporter</button><button data-act="import">Importer</button></div></section>`;
}
