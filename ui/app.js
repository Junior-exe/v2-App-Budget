import { openStore, requestPersistentStorage } from '../data/store.js';
import { buildBackup, serializeBackup, prepareImport, applyImport, backupAgeDays } from '../data/backup.js';
import { createRepository } from '../data/repository.js';
import { demoState } from '../data/demo.js';
import { emptyState } from '../core/types.js';
import { periodKeyOf } from '../core/dates.js';
import { buildDashboard, buildAccountsScreen, buildCategoriesScreen, buildTransactionsScreen, buildMoreScreen, todayLocal } from './view-model.js';
import { renderDashboard, esc } from './render.js';
import * as S from './screens.js';
import { routeFromHash } from './routes.js';

const app = document.getElementById('app'), fileInput = document.getElementById('file');
const viewFromHash = () => routeFromHash(location.hash);
let store, repo, state, vm = null, persisted = null, view = viewFromHash(), monthKey = periodKeyOf(todayLocal());

function toast(msg) {
  const t = document.getElementById('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 2200);
}

async function refresh() {
  state = await store.loadState();
  document.getElementById('nav').innerHTML = S.renderNav(view);
  if (view === 'home') {
    vm = buildDashboard(state, monthKey);
    app.innerHTML = renderDashboard(vm, { empty: state.accounts.length === 0, isDemo: !!(await store.getMeta('isDemo')), ...(await backupUi()) });
  } else if (view === 'transactions') { vm = buildTransactionsScreen(state, monthKey); app.innerHTML = S.renderTransactions(vm); }
  else if (view === 'accounts') app.innerHTML = S.renderAccounts(buildAccountsScreen(state));
  else if (view === 'categories') app.innerHTML = S.renderCategories(buildCategoriesScreen(state));
  else app.innerHTML = S.renderMore(buildMoreScreen(state), await backupUi());
}

async function backupUi() {
  const last = await store.lastBackupAt();
  return { neverBackedUp: last === null, backupAge: backupAgeDays(last, new Date().toISOString()), persisted };
}

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ask(html, okLabel) {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.innerHTML = `${html}<form method="dialog"><button value="cancel">${okLabel ? 'Annuler' : 'Fermer'}</button>${okLabel ? `<button class="primary" value="ok">${okLabel}</button>` : ''}</form>`;
    d.addEventListener('close', () => { resolve(d.returnValue === 'ok'); d.remove(); });
    document.body.append(d); d.showModal();
  });
}

/** Feuille de saisie : valide via le repository ; avertissements → confirmation avant enregistrement. */
function sheet(html, { onSubmit, onDelete, saved = 'Enregistré' }) {
  const d = document.createElement('dialog'); d.className = 'sheet'; d.innerHTML = html;
  const form = d.querySelector('form'), err = d.querySelector('.err');
  const show = (msgs) => { err.textContent = msgs.join(' '); err.hidden = msgs.length === 0; };
  d.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) d.close(); });
  form.addEventListener('change', (e) => {
    if (form.dataset.form === 'tx' && e.target.name === 'type') form.dataset.type = e.target.value;
    if (form.dataset.form === 'account' && e.target.name === 'type') form.isSavings.checked = e.target.value === 'savings';
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); show([]);
    try {
      let r = await onSubmit(new FormData(form), false);
      if (!r.ok && r.needsConfirm && confirm(`${r.warnings.join('\n')}\n\nContinuer ?`)) r = await onSubmit(new FormData(form), true);
      if (r.ok) { d.close(); toast(saved); await refresh(); } else if (!r.needsConfirm) show(r.errors);
    } catch (x) { show([x.message]); }
  });
  d.querySelector('[data-del]')?.addEventListener('click', async () => {
    if (!confirm('Supprimer cette opération ?')) return;
    const r = await onDelete(); if (r.ok) { d.close(); toast('Supprimée'); await refresh(); } else show(r.errors);
  });
  d.addEventListener('close', () => d.remove());
  document.body.append(d); d.showModal();
}

async function openTx(tx = null) {
  const prefs = (await store.getMeta('ui')) ?? {};
  sheet(S.transactionFormHtml(state, tx, { type: 'expense', date: todayLocal(), status: 'done', accountId: prefs.lastAccountId }), {
    async onSubmit(fd, confirmed) {
      const input = S.readTransactionForm(fd);
      const r = await repo.saveTransaction(input, { confirmWarnings: confirmed });
      if (r.ok && input.accountId) await store.setMeta('ui', { ...prefs, lastAccountId: input.accountId }); // compte mémorisé pour la saisie rapide
      return r;
    },
    onDelete: tx && (() => repo.deleteTransaction(tx.id)),
  });
}

const openAccount = (a = null) => sheet(S.accountFormHtml(a), { onSubmit: (fd, c) => repo.saveAccount(S.readAccountForm(fd), { confirmWarnings: c }) });
const openCategory = (c = null, kind = 'expense') => sheet(S.categoryFormHtml(c, kind), { onSubmit: (fd, ok) => repo.saveCategory(S.readCategoryForm(fd), { confirmWarnings: ok }) });
const go = (v) => { if (location.hash.slice(1) === v) return refresh(); location.hash = v; };

const actions = {
  view: (el) => go(el.dataset.view),
  'go-accounts': () => go('accounts'),
  prev: async () => { monthKey = vm.prevKey; await refresh(); },
  next: async () => { monthKey = vm.nextKey; await refresh(); },
  'new-tx': () => state.accounts.some((a) => a.active) ? openTx() : (go('accounts'), toast('Créez d’abord un compte')),
  'edit-tx': (el) => openTx(state.transactions.find((t) => t.id === el.dataset.id)),
  'new-account': () => openAccount(),
  'edit-account': (el) => openAccount(state.accounts.find((a) => a.id === el.dataset.id)),
  'new-cat': (el) => openCategory(null, el.dataset.kind),
  'edit-cat': (el) => openCategory(state.categories.find((c) => c.id === el.dataset.id)),
  async 'seed-cats'() { toast(`${await repo.seedDefaultCategories()} catégorie(s) ajoutée(s)`); await refresh(); },
  import: () => fileInput.click(),
  async export() {
    const now = new Date().toISOString();
    download(`budget-sauvegarde-${todayLocal()}.json`, serializeBackup(buildBackup(await store.loadState(), now)));
    await store.markBackupDone(now); await refresh();
  },
  async demo() {
    await store.replaceAll(demoState(todayLocal())); await store.setMeta('isDemo', true);
    persisted = (await requestPersistentStorage()).persisted; await refresh();
  },
  async 'clear-demo'() {
    if (!(await ask('<p>Effacer les données de démonstration ?</p>', 'Effacer'))) return;
    await store.replaceAll(emptyState()); await store.setMeta('isDemo', false); await refresh();
  },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (el) actions[el.dataset.act]?.(el)?.catch?.((err) => alert(err.message));
});
document.getElementById('fab').addEventListener('click', () => actions['new-tx']());
window.addEventListener('hashchange', () => { view = viewFromHash(); window.scrollTo(0, 0); refresh(); });

fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0]; fileInput.value = ''; if (!file) return;
  const p = prepareImport(await file.text());
  if (!p.ok) return void ask(`<p><strong>Import impossible</strong></p><ul>${p.errors.slice(0, 5).map((m) => `<li>${esc(m)}</li>`).join('')}</ul>`, null);
  const s = p.summary;
  const okay = await ask(`<p><strong>Remplacer toutes les données actuelles ?</strong></p><p>Le fichier contient ${s.accounts} compte(s), ${s.transactions} opération(s)${s.firstDate ? ` du ${esc(s.firstDate)} au ${esc(s.lastDate)}` : ''}, ${s.rules} règle(s), ${s.budgets} budget(s), ${s.closures} clôture(s).</p><p class="note">Une sauvegarde de sécurité de vos données actuelles sera téléchargée.</p>`, 'Remplacer');
  if (!okay) return;
  const { safetyBackup } = await applyImport(store, p, { confirmed: true });
  download(`budget-securite-${todayLocal()}.json`, safetyBackup);
  await store.setMeta('isDemo', false); persisted = (await requestPersistentStorage()).persisted; await refresh();
});

try {
  store = await openStore(); repo = createRepository(store);
  persisted = (await requestPersistentStorage()).persisted;
  await refresh();
  navigator.serviceWorker?.register('./sw.js').catch(() => {});
} catch (err) {
  app.innerHTML = `<section class="card"><h2>Stockage indisponible</h2><p class="note">${esc(err.message)}</p></section>`;
}
