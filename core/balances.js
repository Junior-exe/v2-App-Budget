// OÙ est l'argent : solde réel de chaque compte. Indépendant du budget et de l'argent libre.
// solde = solde initial + revenus reçus − dépenses ± transferts, opérations 'done' uniquement.
export function computeBalances(accounts, transactions, { asOf = null } = {}) {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const byAccount = Object.fromEntries(accounts.map((a) => [a.id, a.openingBalanceCents]));
  for (const t of transactions) {
    if (t.status !== 'done') continue;               // un prévu ne change jamais un solde
    if (asOf && t.date > asOf) continue;
    const apply = (id, delta) => {
      const a = byId.get(id);
      if (!a) throw new Error(`Compte inconnu : ${id}`);
      if (t.date >= a.openingDate) byAccount[id] += delta; // avant : déjà dans le solde initial
    };
    if (t.type === 'income') apply(t.accountId, t.amountCents);
    else if (t.type === 'expense') apply(t.accountId, -t.amountCents);
    else if (t.type === 'transfer') {
      if (t.fromAccountId === t.toAccountId) throw new Error('Transfert vers le même compte');
      apply(t.fromAccountId, -t.amountCents);
      apply(t.toAccountId, t.amountCents);
    } else throw new Error(`Type d'opération inconnu : ${t.type}`);
  }
  const totalCents = accounts.filter((a) => a.active).reduce((s, a) => s + byAccount[a.id], 0);
  return { byAccount, totalCents };
}
