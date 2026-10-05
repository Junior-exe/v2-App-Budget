// Écrans de gestion (HTML) et lecture des formulaires. Aucune formule financière : uniquement de l'affichage.
import { formatCents, centsToInput } from '../core/money.js';
import { esc, renderBackupCard } from './render.js';
import { tabs, tabOf } from './routes.js';

export const renderNav = (view) => tabs().map((t) => `<button data-act="view" data-view="${t.id}"${t.id === tabOf(view) ? ' class="on" aria-current="page"' : ''}>${t.label}</button>`).join('');

const TYPES = { checking: 'Compte courant', savings: 'Épargne', cash: 'Espèces', other: 'Autre' };
const header = (vm) => `<header class="top"><button data-act="prev" aria-label="Mois précédent">‹</button><h1>${esc(vm.label)}</h1><button data-act="next" aria-label="Mois suivant">›</button></header>`;
const dayOf = (d) => `${d.slice(8)}/${d.slice(5, 7)}`;

// ---------- Opérations ----------
export function renderTransactions(vm) {
  const rows = vm.items.map((i) => {
    const amount = i.type === 'expense' ? `−${formatCents(i.amountCents)}` : i.type === 'income' ? `+${formatCents(i.amountCents)}` : formatCents(i.amountCents);
    const cls = i.type === 'income' ? 'pos' : i.type === 'transfer' ? 'muted' : '';
    return `<button class="item" data-act="edit-tx" data-id="${esc(i.id)}"><span class="grow"><strong>${esc(i.title)}</strong>
      <small>${dayOf(i.date)} · ${esc(i.subtitle)}${i.status === 'planned' ? ' <em class="badge">Prévu</em>' : ''}</small></span>
      <span class="amt ${cls}" data-k="tx:${esc(i.id)}" data-type="${i.type}" data-cents="${i.amountCents}">${amount}</span></button>`;
  }).join('');
  return `${header(vm)}<div class="narrow"><section class="card">${rows || '<p class="note">Aucune opération ce mois-ci. Utilisez le bouton + pour en ajouter une.</p>'}</section></div>`;
}

// ---------- Comptes ----------
export function renderAccounts(vm) {
  const row = (a) => `<button class="item" data-act="edit-account" data-id="${esc(a.id)}"><span class="grow"><strong>${esc(a.name)}</strong>
    <small>${TYPES[a.type]}${a.isSavings ? ' · épargne' : ''}${a.active ? '' : ' · désactivé'}</small></span>
    <span class="amt" data-k="balance:${esc(a.id)}" data-cents="${a.balanceCents}">${formatCents(a.balanceCents)}</span></button>`;
  return `<header class="top"><h1>Comptes</h1></header>
    <div class="grid"><section class="card real"><p class="tag">SOLDE RÉEL</p>${vm.active.map(row).join('') || '<p class="note">Aucun compte. Créez votre premier compte pour commencer.</p>'}
    ${vm.active.length ? `<div class="row"><strong>Total</strong><span class="amt" data-k="total" data-cents="${vm.totalCents}">${formatCents(vm.totalCents)}</span></div>` : ''}</section>
    ${vm.inactive.length ? `<section class="card"><h2>Comptes désactivés <small class="muted">(non comptés dans le total)</small></h2>${vm.inactive.map(row).join('')}</section>` : ''}</div>
    <div class="actions"><button class="primary" data-act="new-account">Nouveau compte</button></div>`;
}

export function accountFormHtml(a) {
  const t = a ?? { type: 'checking', isSavings: false, active: true, openingDate: '', openingBalanceCents: 0 };
  return `<h2>${a ? 'Modifier le compte' : 'Nouveau compte'}</h2><form data-form="account">
    <input type="hidden" name="id" value="${esc(a?.id ?? '')}">
    <label>Nom<input name="name" required autofocus value="${esc(a?.name ?? '')}"></label>
    <label>Type<select name="type">${Object.entries(TYPES).map(([k, l]) => `<option value="${k}"${k === t.type ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="check"><input type="checkbox" name="isSavings"${t.isSavings ? ' checked' : ''}> Compte d’épargne (compté comme épargne)</label>
    <label>Solde initial (€)<input name="openingBalance" inputmode="decimal" autocomplete="off" required value="${centsToInput(t.openingBalanceCents)}"></label>
    <label>Date du solde initial<input type="date" name="openingDate" required value="${esc(t.openingDate)}"></label>
    ${a ? `<label class="check"><input type="checkbox" name="active"${t.active ? ' checked' : ''}> Compte actif</label>` : '<input type="hidden" name="active" value="on">'}
    <p class="err" hidden></p><div class="actions"><button type="button" data-close>Annuler</button><button class="primary" type="submit">Enregistrer</button></div></form>`;
}
export const readAccountForm = (fd) => ({ id: fd.get('id') || undefined, name: fd.get('name'), type: fd.get('type'),
  isSavings: fd.get('isSavings') === 'on', openingBalance: fd.get('openingBalance'), openingDate: fd.get('openingDate'), active: fd.get('active') === 'on' });

// ---------- Catégories ----------
export function renderCategories(vm) {
  const list = (g) => g.active.map((c) => `<button class="item" data-act="edit-cat" data-id="${esc(c.id)}"><span class="grow">${esc(c.name)}</span></button>`).join('')
    + g.inactive.map((c) => `<button class="item" data-act="edit-cat" data-id="${esc(c.id)}"><span class="grow muted">${esc(c.name)} · désactivée</span></button>`).join('');
  const none = !vm.expense.active.length && !vm.income.active.length;
  return `<header class="top"><button class="back" data-act="view" data-view="more">‹ Plus</button><h1>Catégories</h1><span></span></header>
    ${none ? '<section class="card narrow"><p class="note">Aucune catégorie. Vous pouvez ajouter une sélection de catégories usuelles, puis les modifier.</p><div class="actions"><button class="primary" data-act="seed-cats">Ajouter les catégories usuelles</button></div></section>' : ''}
    <div class="grid"><section class="card"><h2>Dépenses</h2>${list(vm.expense)}<div class="actions"><button data-act="new-cat" data-kind="expense">Nouvelle catégorie de dépense</button></div></section>
    <section class="card"><h2>Revenus</h2>${list(vm.income)}<div class="actions"><button data-act="new-cat" data-kind="income">Nouvelle catégorie de revenu</button></div></section></div>`;
}

export function categoryFormHtml(c, kind) {
  return `<h2>${c ? 'Modifier la catégorie' : kind === 'income' ? 'Nouvelle catégorie de revenu' : 'Nouvelle catégorie de dépense'}</h2><form data-form="category">
    <input type="hidden" name="id" value="${esc(c?.id ?? '')}"><input type="hidden" name="kind" value="${esc(c?.kind ?? kind)}">
    <label>Nom<input name="name" required autofocus value="${esc(c?.name ?? '')}"></label>
    ${c ? `<label class="check"><input type="checkbox" name="active"${c.active ? ' checked' : ''}> Catégorie active</label>` : '<input type="hidden" name="active" value="on">'}
    <p class="err" hidden></p><div class="actions"><button type="button" data-close>Annuler</button><button class="primary" type="submit">Enregistrer</button></div></form>`;
}
export const readCategoryForm = (fd) => ({ id: fd.get('id') || undefined, name: fd.get('name'), kind: fd.get('kind'), active: fd.get('active') === 'on' });

// ---------- Saisie d'une opération ----------
export function transactionFormHtml(state, tx, d = {}) {
  const t = tx ?? {};
  const type = t.type ?? d.type ?? 'expense', status = t.status ?? d.status ?? 'done';
  const used = [t.accountId, t.fromAccountId, t.toAccountId];
  const accs = state.accounts.filter((a) => a.active || used.includes(a.id)).sort((a, b) => a.order - b.order);
  const first = accs.find((a) => a.active) ?? accs[0];
  const acc = t.accountId ?? d.accountId ?? first?.id;
  const from = t.fromAccountId ?? d.accountId ?? first?.id;
  const to = t.toAccountId ?? accs.find((a) => a.id !== from)?.id;
  const opts = (sel) => accs.map((a) => `<option value="${esc(a.id)}"${a.id === sel ? ' selected' : ''}>${esc(a.name)}</option>`).join('');
  const cats = (kind) => '<option value="">Aucune</option>' + state.categories.filter((c) => c.kind === kind && (c.active || c.id === t.categoryId))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr')).map((c) => `<option value="${esc(c.id)}"${c.id === t.categoryId ? ' selected' : ''}>${esc(c.name)}</option>`).join('');
  const radio = (name, value, label, on) => `<label><input type="radio" name="${name}" value="${value}"${on ? ' checked' : ''}><span>${label}</span></label>`;
  return `<h2>${tx ? 'Modifier l’opération' : 'Nouvelle opération'}</h2><form data-form="tx" data-type="${type}">
    <input type="hidden" name="id" value="${esc(t.id ?? '')}">
    <div class="seg">${radio('type', 'expense', 'Dépense', type === 'expense')}${radio('type', 'income', 'Revenu', type === 'income')}${radio('type', 'transfer', 'Transfert', type === 'transfer')}</div>
    <label>Montant (€)<input name="amount" inputmode="decimal" autocomplete="off" required autofocus placeholder="0,00" value="${t.amountCents === undefined ? '' : centsToInput(t.amountCents)}"></label>
    <label class="flow">Compte<select name="accountId">${opts(acc)}</select></label>
    <label class="xfer">De<select name="fromAccountId">${opts(from)}</select></label>
    <label class="xfer">Vers<select name="toAccountId">${opts(to)}</select></label>
    <label class="only-expense">Catégorie<select name="categoryExpense">${cats('expense')}</select></label>
    <label class="only-income">Catégorie<select name="categoryIncome">${cats('income')}</select></label>
    <label>Date<input type="date" name="date" required value="${esc(t.date ?? d.date ?? '')}"></label>
    <label>Description (facultatif)<input name="description" autocomplete="off" value="${esc(t.description ?? '')}"></label>
    <div class="seg">${radio('status', 'done', 'Réalisé', status === 'done')}${radio('status', 'planned', 'Prévu', status === 'planned')}</div>
    <p class="note xfer">Un retrait d’espèces ou d’épargne est un transfert : il ne compte ni comme dépense ni comme revenu.</p>
    <p class="err" hidden></p>
    <div class="actions">${tx ? '<button type="button" class="danger" data-del>Supprimer</button>' : ''}<button type="button" data-close>Annuler</button><button class="primary" type="submit">Enregistrer</button></div></form>`;
}
export function readTransactionForm(fd) {
  const type = fd.get('type');
  const base = { id: fd.get('id') || undefined, type, amount: fd.get('amount'), date: fd.get('date'),
    description: fd.get('description'), status: fd.get('status') };
  return type === 'transfer' ? { ...base, fromAccountId: fd.get('fromAccountId'), toAccountId: fd.get('toAccountId') }
    : { ...base, accountId: fd.get('accountId'), categoryId: fd.get(type === 'expense' ? 'categoryExpense' : 'categoryIncome') || null };
}

// ---------- Plus (hub) ----------
export function renderMore(vm, ui) {
  return `<header class="top"><h1>Plus</h1></header><div class="grid">
    <section class="card"><h2>Organisation</h2>
      <button class="item" data-act="view" data-view="categories"><span class="grow"><strong>Catégories</strong><small>${vm.categories} active(s)</small></span><span class="muted">›</span></button></section>
    ${renderBackupCard(ui)}</div>`;
}
