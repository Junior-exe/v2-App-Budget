import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { ROUTES, routeFromHash, tabOf, tabs } from '../routes.js';
import { renderNav, renderMore, renderAccounts, renderCategories, renderTransactions } from '../screens.js';
import { renderDashboard } from '../render.js';
import { buildDashboard, buildAccountsScreen, buildCategoriesScreen, buildTransactionsScreen, buildMoreScreen } from '../view-model.js';
import { demoState } from '../../data/demo.js';

const read = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
const doc = (html) => new JSDOM(`<main>${html}</main>`).window.document;
const state = demoState('2026-10-30');

test('Routes : identifiants uniques, parents valides, 5 onglets au maximum', () => {
  const ids = ROUTES.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const r of ROUTES) assert.ok(r.tab || ids.includes(r.parent), r.id);
  assert.ok(tabs().length <= 5);
});

test('Routes : lecture de l’adresse et onglet actif d’un écran enfant', () => {
  assert.equal(routeFromHash('#accounts'), 'accounts');
  assert.equal(routeFromHash('#/categories'), 'categories');
  for (const h of ['', '#', '#inconnu', undefined]) assert.equal(routeFromHash(h), 'home');
  assert.equal(tabOf('categories'), 'more');
  const nav = doc(renderNav('categories'));
  assert.equal(nav.querySelectorAll('[aria-current]').length, 1);
  assert.equal(nav.querySelector('[aria-current]').dataset.view, 'more');
});

test('Écrans : cartes en grille adaptative, Catégories accessible depuis Plus, sauvegarde accessible', () => {
  const home = doc(renderDashboard(buildDashboard(state, '2026-10'), { neverBackedUp: true }));
  assert.equal(home.querySelectorAll('.grid > .card').length, 6);
  assert.ok(home.querySelector('.grid [data-act=export]') && home.querySelector('.grid [data-act=import]'));
  const more = doc(renderMore(buildMoreScreen(state), { neverBackedUp: true }));
  assert.equal(more.querySelector('[data-view=categories]').dataset.act, 'view');
  assert.ok(more.querySelector('[data-act=export]') && more.querySelector('[data-act=import]'));
  assert.ok(doc(renderAccounts(buildAccountsScreen(state))).querySelector('.grid'));
  const cats = doc(renderCategories(buildCategoriesScreen(state)));
  assert.equal(cats.querySelectorAll('.grid > .card').length, 2);
  assert.equal(cats.querySelector('.back').dataset.view, 'more'); // retour vers Plus
  assert.ok(doc(renderTransactions(buildTransactionsScreen(state, '2026-10'))).querySelector('.narrow'));
});

test('CSS : modales (toutes) et mise en page adaptative', () => {
  const css = read('styles.css').replace(/\s+/g, ' ');
  const rule = (sel) => new RegExp(`(?:^|[}/])\\s*${sel.replace(/[.[\]()]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
  const modal = rule('dialog');
  for (const d of ['width:90%', 'max-width:500px', 'max-height:90vh', 'overflow-y:auto', 'box-sizing:border-box']) assert.ok(modal.includes(d), d);
  // Cause du débordement corrigée : aucune règle générique qui met TOUS les formulaires d'une modale en ligne
  assert.ok(!/dialog form\s*\{/.test(css));
  assert.match(rule('dialog form[method=dialog]'), /flex-wrap:wrap/);
  assert.match(rule('form .actions'), /position:sticky/);
  assert.match(css, /form input:not\(\[type=checkbox\]\):not\(\[type=radio\]\), form select \{ min-width:0; max-width:100%/);
  assert.match(css, /repeat\(auto-fit, minmax\(min\(320px, 100%\), 1fr\)\)/);
  assert.match(css, /@media \(min-width:768px\) \{ main \{ max-width:1000px/);
  assert.match(css, /#nav \{ position:sticky/);
});

test('Page : la navigation précède le contenu, fenêtre d’affichage adaptée, hors-ligne à jour', () => {
  const html = read('index.html');
  assert.ok(html.indexOf('id="nav"') < html.indexOf('id="app"'));
  assert.match(html, /width=device-width, initial-scale=1, viewport-fit=cover/);
  assert.ok(read('sw.js').includes("'ui/routes.js'"));
});
