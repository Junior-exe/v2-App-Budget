// Montants : entiers de centimes uniquement.
export function assertCents(n, label = 'montant') {
  if (!Number.isSafeInteger(n)) throw new TypeError(`${label} doit être un entier de centimes`);
  return n;
}

/** "12,50" | "1 900" | 12.5 → centimes. Refuse les valeurs ambiguës (ex. 0.1+0.2). */
export function eurosToCents(input) {
  const s = String(input).trim().replace(/\s/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) throw new RangeError(`Montant invalide : ${input}`);
  const neg = s.startsWith('-');
  const [i, f = ''] = s.replace('-', '').split('.');
  const c = parseInt(i, 10) * 100 + parseInt((f + '00').slice(0, 2), 10);
  return neg ? -c : c;
}

export function formatCents(cents) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

/** Pourcentage en points de base (2000 = 20 %), arrondi au centime le plus proche. */
export function percentOfCents(cents, basisPoints) {
  assertCents(cents); assertCents(basisPoints, 'pourcentage');
  return Math.round((cents * basisPoints) / 10000);
}

/** Centimes → texte pour un champ de saisie ("12,50"), sans passer par les flottants. */
export function centsToInput(cents) {
  assertCents(cents);
  const a = Math.abs(cents);
  return `${cents < 0 ? '-' : ''}${Math.trunc(a / 100)},${String(a % 100).padStart(2, '0')}`;
}
