import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { IDBFactory } from 'fake-indexeddb';
import { openStore } from '../../data/store.js';
import { createRepository } from '../../data/repository.js';
import { computeBalances } from '../../core/balances.js';
import { computeMonth } from '../../core/month.js';
import { formatCents } from '../../core/money.js';
import { buildAccountsScreen, buildTransactionsScreen } from '../view-model.js';
import { renderAccounts, renderTransactions, transactionFormHtml, accountFormHtml, readTransactionForm, readAccountForm } from '../screens.js';

async function setup() {
  const store = await openStore(new IDBFactory()); let n = 0;
  const repo = createRepository(store, { idFn: () => `id${++n}` });
  const a = (name, type, o = {}) => repo.saveAccount({ name, type, isSavings: type === 'savings', openingBalance: '1000', openingDate: '2026-10-01', active: true, ...o });
  const ids = { cc: (await a('Courant', 'checking')).value.id, esp: (await a('Espèces', 'cash')).value.id, ep: (await a('Épargne', 'savings')).value.id };
  return { store, repo, ids };
}
const dom = (html) => new JSDOM(`<main>${html}</main>`).window;

test('Saisie via le vrai formulaire : lecture du formulaire → repository → soldes du core', async () => {
  const { store, repo, ids } = await setup();
  const w = dom(transactionFormHtml(await store.loadState(), null, { date: '2026-10-05', accountId: ids.cc }));
  const form = w.document.querySelector('form'), set = (n, v) => { form.elements[n].value = v; };
  // Dépense rapide : seulement le montant à saisir
  set('amount', '12,5');
  let r = await repo.saveTransaction(readTransactionForm(new w.FormData(form)));
  assert.ok(r.ok, r.errors.join());
  assert.deepEqual([r.value.type, r.value.status, r.value.amountCents, r.value.accountId, r.value.date], ['expense', 'done', 1250, ids.cc, '2026-10-05']);
  // Retrait d'espèces : transfert courant → espèces
  form.querySelector('input[name=type][value=transfer]').checked = true;
  set('amount', '100'); set('fromAccountId', ids.cc); set('toAccountId', ids.esp);
  r = await repo.saveTransaction(readTransactionForm(new w.FormData(form)));
  assert.ok(r.ok, r.errors.join());
  assert.equal(r.value.type, 'transfer'); assert.equal(r.value.categoryId, null);
  const s = await store.loadState(), b = computeBalances(s.accounts, s.transactions).byAccount;
  assert.deepEqual([b[ids.cc], b[ids.esp]], [100000 - 1250 - 10000, 100000 + 10000]);
  const m = computeMonth(s, '2026-10');
  assert.equal(m.expenses.totalDoneCents, 1250); // le transfert n'est pas une dépense
});

test('Liste des opérations : signes d’affichage et transferts neutres', async () => {
  const { store, repo, ids } = await setup();
  const base = { status: 'done', date: '2026-10-05' };
  await repo.saveTransaction({ ...base, type: 'income', amount: '50', accountId: ids.cc });
  await repo.saveTransaction({ ...base, type: 'expense', amount: '20', accountId: ids.cc, description: 'Pain' });
  await repo.saveTransaction({ ...base, type: 'transfer', amount: '30', fromAccountId: ids.ep, toAccountId: ids.cc });
  await repo.saveTransaction({ ...base, type: 'expense', amount: '9', accountId: ids.cc, status: 'planned' });
  const s = await store.loadState();
  const vm = buildTransactionsScreen(s, '2026-10');
  assert.equal(vm.items.length, 4);
  const d = dom(renderTransactions(vm)).document;
  for (const el of d.querySelectorAll('[data-k]')) {
    const c = Number(el.dataset.cents), t = el.dataset.type;
    if (t === 'transfer') assert.equal(el.textContent, formatCents(c));            // aucun signe : ni revenu ni dépense
    else if (t === 'income') assert.equal(el.textContent, `+${formatCents(c)}`);
    else assert.equal(el.textContent, `−${formatCents(c)}`);
  }
  assert.equal(d.querySelectorAll('.badge').length, 1); // une seule opération « Prévu »
  assert.equal(renderTransactions({ ...vm, items: [] }).includes('Aucune opération'), true);
});

test('Écran des comptes : soldes identiques au core, comptes désactivés séparés', async () => {
  const { store, repo, ids } = await setup();
  await repo.saveTransaction({ type: 'expense', amount: '10', accountId: ids.esp, date: '2026-10-05', status: 'done' });
  await repo.setAccountActive(ids.ep, false, { confirmWarnings: true });
  const s = await store.loadState(), core = computeBalances(s.accounts, s.transactions);
  const vm = buildAccountsScreen(s), d = dom(renderAccounts(vm)).document;
  for (const el of d.querySelectorAll('[data-k^=balance]')) assert.equal(Number(el.dataset.cents), core.byAccount[el.dataset.k.slice(8)]);
  assert.equal(Number(d.querySelector('[data-k=total]').dataset.cents), core.totalCents);
  assert.equal(vm.inactive.length, 1);
  assert.match(d.body.textContent, /non comptés dans le total/);
});

test('Formulaires : comptes désactivés non proposés, échappement HTML, lecture du compte', async () => {
  const { store, repo, ids } = await setup();
  await repo.saveAccount({ id: ids.esp, name: '<b>x</b>' });
  await repo.setAccountActive(ids.ep, false, { confirmWarnings: true });
  const s = await store.loadState();
  const neuf = dom(transactionFormHtml(s, null, { date: '2026-10-05' })).document;
  const proposes = [...neuf.querySelectorAll('select[name=accountId] option')].map((o) => o.value);
  assert.ok(!proposes.includes(ids.ep) && proposes.includes(ids.esp));
  assert.equal(neuf.querySelectorAll('b').length, 0);
  const tx = (await repo.saveTransaction({ type: 'expense', amount: '1', accountId: ids.cc, date: '2026-10-05', status: 'done' })).value;
  const edit = dom(transactionFormHtml(await store.loadState(), tx, {})).document;
  assert.equal(edit.querySelector('input[name=amount]').value, '1,00');
  assert.ok(edit.querySelector('[data-del]'));
  const w = dom(accountFormHtml(null)), f = w.document.querySelector('form');
  f.elements.name.value = 'Livret'; f.elements.type.value = 'savings'; f.elements.isSavings.checked = true;
  f.elements.openingBalance.value = '250,40'; f.elements.openingDate.value = '2026-10-01';
  const r = await repo.saveAccount(readAccountForm(new w.FormData(f)));
  assert.deepEqual([r.value.isSavings, r.value.openingBalanceCents, r.value.active], [true, 25040, true]);
});
