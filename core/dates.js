// Dates "AAAA-MM-JJ" et périodes "AAAA-MM". Toute la logique de période passe par ce fichier :
// pour un futur « jour de début de mois », seul ce fichier changera.
export function lastDayOfMonth(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function isValidDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const mo = +m[2], d = +m[3];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= lastDayOfMonth(`${m[1]}-${m[2]}`);
}

function assertCivil(startDay) {
  if (startDay !== 1) throw new Error('Jour de début de mois ≠ 1 : non pris en charge dans le MVP');
}

export function periodKeyOf(date, startDay = 1) {
  assertCivil(startDay);
  if (!isValidDate(date)) throw new RangeError(`Date invalide : ${date}`);
  return date.slice(0, 7);
}

export function periodRange(key, startDay = 1) {
  assertCivil(startDay);
  return { start: `${key}-01`, end: `${key}-${String(lastDayOfMonth(key)).padStart(2, '0')}` };
}

export function addMonths(key, n) {
  const [y, m] = key.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

/** Jour demandé ramené au dernier jour du mois si besoin (31 → 28/29/30). */
export function dateInMonth(key, day) {
  return `${key}-${String(Math.min(day, lastDayOfMonth(key))).padStart(2, '0')}`;
}
