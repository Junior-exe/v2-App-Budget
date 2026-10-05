// Table des écrans. Un écran « enfant » (parent) s'ouvre depuis un hub et garde l'onglet du hub actif.
// Pour ajouter un écran : une ligne ici + son rendu dans app.js. Les onglets (tab) restent peu nombreux (max 5).
export const ROUTES = [
  { id: 'home', label: 'Accueil', tab: true },
  { id: 'transactions', label: 'Opérations', tab: true },
  { id: 'accounts', label: 'Comptes', tab: true },
  { id: 'more', label: 'Plus', tab: true },
  { id: 'categories', label: 'Catégories', parent: 'more' },
];
export const DEFAULT_ROUTE = 'home';
export const routeFromHash = (hash) => {
  const id = String(hash ?? '').replace(/^#\/?/, '');
  return ROUTES.some((r) => r.id === id) ? id : DEFAULT_ROUTE;
};
export const tabOf = (id) => { const r = ROUTES.find((x) => x.id === id); return r?.parent ?? r?.id ?? DEFAULT_ROUTE; };
export const tabs = () => ROUTES.filter((r) => r.tab);
