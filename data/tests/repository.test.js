import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { openStore } from '../store.js';
import { createRepository } from '../repository.js';
import { buildBackup, serializeBackup, prepareImport, applyImport } from '../backup.js';
import { validateState } from '../validate.js';
import { defaultSavingsPlan } from '../../core/types.js';
import { computeBalances } from '../../core/balances.js';
import { computeMonth } from '../../core/month.js';
import { centsToInput, eurosToCents } from '../../core/money.js';

const M = '2026-10';
async function setup() {
  const store = await openStore(new IDBFactory());
  let n = 0;
  const repo = createRepository(store, { idFn: () => `id${++n}` });
  const acc = async (name, type, opening, extra = {}) =>
    (await repo.saveAccount({ name, type, isSavings: type === 'savings', openingBalance: opening, openingDate: '2026-10-01', active: true, ...extra })).value.id;
  const cat = async (name, kind) => (await repo.saveCategory({ name, kind })).value.id;
  const ids = { cc: await acc('Compte courant', 'checking', '1000'), esp: await acc('Espèces', 'cash', '0'),
    ep: await acc('Épargne', 'savings', '500'), alim: await cat('Alimentation', 'expense'), sal: await cat('Salaire', 'income') };
  await store.saveSavingsPlan(defaultSavingsPlan());
  const tx = (o) => repo.saveTransaction({ status: 'done', date: '2026-10-05', ...o });
  const bal = async () => { const s = await store.loadState(); return computeBalances(s.accounts, s.transactions); };
  const month = async () => computeMonth(await store.loadState(), M);
  return { store, repo, ids, tx, bal, month };
}
const eur = (n) => n * 100;

test('Scénario complet : soldes, argent libre, transferts jamais revenus ni dépenses', async () => {
  const { ids, tx, bal, month, store } = await setup();
  assert.deepEqual((await bal()).byAccount, { [ids.cc]: eur(1000), [ids.esp]: 0, [ids.ep]: eur(500) });

  assert.ok((await tx({ type: 'income', amount: '2000', accountId: ids.cc, categoryId: ids.sal })).ok);
  assert.equal((await bal()).byAccount[ids.cc], eur(3000));                       // revenu : + compte
  assert.ok((await tx({ type: 'expense', amount: '35', accountId: ids.cc, categoryId: ids.alim })).ok);
  assert.equal((await bal()).byAccount[ids.cc], eur(2965));                       // dépense compte courant : − compte

  assert.ok((await tx({ type: 'transfer', amount: '200', fromAccountId: ids.cc, toAccountId: ids.esp })).ok); // retrait d'espèces
  let b = (await bal()).byAccount;
  assert.deepEqual([b[ids.cc], b[ids.esp]], [eur(2765), eur(200)]);               // source − , destination +
  assert.ok((await tx({ type: 'expense', amount: '12,50', accountId: ids.esp })).ok);
  assert.equal((await bal()).byAccount[ids.esp], 18750);                          // dépense en espèces
  assert.ok((await tx({ type: 'transfer', amount: '300', fromAccountId: ids.cc, toAccountId: ids.ep })).ok); // courant → épargne
  assert.ok((await tx({ type: 'transfer', amount: '100', fromAccountId: ids.ep, toAccountId: ids.cc })).ok); // retrait d'épargne
  b = (await bal()).byAccount;
  assert.deepEqual([b[ids.cc], b[ids.esp], b[ids.ep]], [eur(2565), 18750, eur(700)]);
  assert.equal((await bal()).totalCents, 100000 + 50000 + 200000 - 3500 - 1250);   // seuls revenus et dépenses changent le total

  const m = await month();
  assert.equal(m.income.receivedCents, eur(2000));          // aucun transfert dans les revenus
  assert.equal(m.expenses.totalDoneCents, 3500 + 1250);     // aucun transfert dans les dépenses
  assert.equal(m.freeSpentCents, 4750);
  assert.equal(m.savings.netTransferredCents, eur(300) - eur(100));
  assert.equal(m.free.currentCents, eur(2000) - eur(400) - 4750); // argent libre calculé par le moteur
  // Les transferts n'ont aucun effet sur les revenus, dépenses et l'argent libre
  const sansTransferts = computeMonth({ ...(await store.loadState()), transactions: (await store.loadState()).transactions.filter((t) => t.type !== 'transfer') }, M);
  assert.deepEqual([m.income, m.expenses, m.freeSpentCents, m.free.currentCents], [sansTransferts.income, sansTransferts.expenses, sansTransferts.freeSpentCents, sansTransferts.free.currentCents]);
});

test('Prévu : aucun effet sur les soldes tant que ce n’est pas réalisé', async () => {
  const { ids, tx, bal, repo } = await setup();
  const d = await tx({ type: 'expense', amount: '100', accountId: ids.cc, status: 'planned' });
  const i = await tx({ type: 'income', amount: '1900', accountId: ids.cc, status: 'planned' });
  assert.equal((await bal()).byAccount[ids.cc], eur(1000));
  assert.ok((await repo.saveTransaction({ id: d.value.id, status: 'done' })).ok);
  assert.equal((await bal()).byAccount[ids.cc], eur(900));
  assert.equal(i.value.status, 'planned');
});

test('Modifier et supprimer une opération', async () => {
  const { ids, tx, bal, repo } = await setup();
  const t = (await tx({ type: 'expense', amount: '40', accountId: ids.cc })).value;
  await repo.saveTransaction({ id: t.id, amount: '45,5' });
  assert.equal((await bal()).byAccount[ids.cc], 100000 - 4550);
  await repo.saveTransaction({ id: t.id, type: 'transfer', fromAccountId: ids.cc, toAccountId: ids.esp });
  assert.equal((await bal()).totalCents, eur(1500));
  assert.ok((await repo.deleteTransaction(t.id)).ok);
  assert.equal((await bal()).byAccount[ids.cc], eur(1000));
  assert.equal((await repo.deleteTransaction(t.id)).ok, false);
});

test('Saisie refusée : montants, comptes, catégories, dates', async () => {
  const { ids, tx, repo } = await setup();
  const erreurs = async (o) => (await tx(o)).errors.join(' | ');
  assert.match(await erreurs({ type: 'expense', amount: '0', accountId: ids.cc }), /supérieur à 0/);
  assert.match(await erreurs({ type: 'expense', amount: 'abc', accountId: ids.cc }), /invalide/);
  assert.match(await erreurs({ type: 'expense', amount: '5', accountId: 'nul' }), /Compte inconnu/);
  assert.match(await erreurs({ type: 'transfer', amount: '5', fromAccountId: ids.cc, toAccountId: ids.cc }), /différents/);
  assert.match(await erreurs({ type: 'expense', amount: '5', accountId: ids.cc, categoryId: ids.sal }), /ne convient pas/);
  assert.match(await erreurs({ type: 'income', amount: '5', accountId: ids.cc, categoryId: ids.alim }), /ne convient pas/);
  assert.match(await erreurs({ type: 'expense', amount: '5', accountId: ids.cc, date: '2026-02-30' }), /Date invalide/);
  await repo.setAccountActive(ids.esp, false, { confirmWarnings: true });
  assert.match(await erreurs({ type: 'expense', amount: '5', accountId: ids.esp }), /désactivé/);
});

test('Un transfert n’a jamais de catégorie', async () => {
  const { ids, tx } = await setup();
  const t = (await tx({ type: 'transfer', amount: '10', fromAccountId: ids.cc, toAccountId: ids.esp, categoryId: ids.alim })).value;
  assert.equal(t.categoryId, null);
  assert.equal(t.accountId, undefined);
});

test('Mois clôturé : création, modification et suppression refusées', async () => {
  const { ids, tx, repo, store } = await setup();
  const t = (await tx({ type: 'expense', amount: '10', accountId: ids.cc })).value;
  await store.put('closures', { monthKey: '2026-10', closedAt: 'x', extraSavingsCents: 0, realSavingsCents: 0 });
  assert.match((await tx({ type: 'expense', amount: '10', accountId: ids.cc })).errors[0], /clôturé/);
  assert.match((await repo.saveTransaction({ id: t.id, amount: '11' })).errors[0], /clôturé/);
  assert.match((await repo.deleteTransaction(t.id)).errors[0], /clôturé/);
});

test('Comptes : création, modification, désactivation, avertissements', async () => {
  const { ids, tx, repo, store, bal } = await setup();
  assert.match((await repo.saveAccount({ name: 'compte COURANT', type: 'checking', openingBalance: '0', openingDate: '2026-10-01' })).errors[0], /déjà ce nom/);
  assert.match((await repo.saveAccount({ name: '', type: 'cash', openingBalance: '0', openingDate: '2026-10-01' })).errors[0], /obligatoire/);
  const liquide = await repo.saveAccount({ name: 'Épargne liquide', type: 'cash', isSavings: true, openingBalance: '50,25', openingDate: '2026-10-01', active: true });
  assert.equal(liquide.value.isSavings, true);
  assert.equal(liquide.value.openingBalanceCents, 5025);
  await repo.saveAccount({ id: ids.cc, name: 'Courant principal' });
  assert.equal((await store.loadState()).accounts.find((a) => a.id === ids.cc).name, 'Courant principal');
  // désactiver un compte non vide demande confirmation
  const w = await repo.setAccountActive(ids.cc, false);
  assert.equal(w.needsConfirm, true);
  assert.equal((await store.loadState()).accounts.find((a) => a.id === ids.cc).active, true);
  await repo.setAccountActive(ids.cc, false, { confirmWarnings: true });
  assert.equal((await bal()).totalCents, 50000 + 5025 + 0); // le compte désactivé n'est plus compté dans le total
  // déplacer la date du solde initial après des opérations existantes : avertissement
  await repo.setAccountActive(ids.cc, true);
  await tx({ type: 'expense', amount: '10', accountId: ids.cc, date: '2026-10-02' });
  assert.equal((await repo.saveAccount({ id: ids.cc, openingDate: '2026-10-10' })).needsConfirm, true);
  // opération antérieure au solde initial du compte : avertissement
  assert.equal((await tx({ type: 'expense', amount: '1', accountId: ids.ep, date: '2026-09-01' })).needsConfirm, true);
});

test('Catégories : type non modifiable, doublons, désactivation', async () => {
  const { ids, repo, tx } = await setup();
  assert.match((await repo.saveCategory({ id: ids.alim, kind: 'income' })).errors[0], /ne peut pas être modifié/);
  assert.match((await repo.saveCategory({ name: 'alimentation', kind: 'expense' })).errors[0], /déjà/);
  assert.ok((await repo.saveCategory({ name: 'Alimentation', kind: 'income' })).ok); // même nom, autre type : permis
  const t = (await tx({ type: 'expense', amount: '5', accountId: ids.cc, categoryId: ids.alim })).value;
  await repo.setCategoryActive(ids.alim, false);
  assert.match((await tx({ type: 'expense', amount: '5', accountId: ids.cc, categoryId: ids.alim })).errors[0], /désactivée/);
  assert.ok((await repo.saveTransaction({ id: t.id, description: 'ok' })).ok); // l'existant reste modifiable
});

test('Catégories usuelles : ajout sans doublon', async () => {
  const { repo } = await setup();
  assert.equal(await repo.seedDefaultCategories(), 7 + 2 - 2); // Alimentation et Salaire existent déjà
  assert.equal(await repo.seedDefaultCategories(), 0);
});

test('Compatibilité export / import JSON versionné après saisie', async () => {
  const { ids, tx, store, bal } = await setup();
  await tx({ type: 'income', amount: '2000', accountId: ids.cc, categoryId: ids.sal });
  await tx({ type: 'transfer', amount: '300', fromAccountId: ids.cc, toAccountId: ids.ep });
  await tx({ type: 'expense', amount: '19,99', accountId: ids.cc, status: 'planned', description: 'Abonnement' });
  const state = await store.loadState();
  assert.deepEqual(validateState(state), []);
  const prepared = prepareImport(serializeBackup(buildBackup(state, '2026-10-05T00:00:00Z')));
  assert.equal(prepared.ok, true, prepared.errors?.join());
  const store2 = await openStore(new IDBFactory());
  await applyImport(store2, prepared, { confirmed: true });
  const s2 = await store2.loadState();
  assert.deepEqual(computeBalances(s2.accounts, s2.transactions), await bal());
  assert.equal(s2.transactions.length, 3);
});

test('Montants : centsToInput est l’inverse de eurosToCents', () => {
  for (const c of [0, 5, 99, 100, 1250, 190000, -150]) assert.equal(eurosToCents(centsToInput(c)), c);
  assert.equal(centsToInput(1250), '12,50');
});
