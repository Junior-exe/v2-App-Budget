// Structures de données du cœur financier (JSDoc, vérifiables par TypeScript).
// Règles générales : montants en centimes ENTIERS et toujours positifs (le sens vient du type),
// dates au format "AAAA-MM-JJ", mois au format "AAAA-MM", identifiants UUID.
// Les soldes ne sont JAMAIS stockés : ils sont recalculés (balances.js).

export const SCHEMA_VERSION = 1;
export const TX_TYPES = ['income', 'expense', 'transfer']; // 'adjustment' sera ajouté avec la réconciliation
export const TX_STATUS = ['planned', 'done'];
export const ACCOUNT_TYPES = ['checking', 'savings', 'cash', 'other'];

/**
 * @typedef {Object} Account
 * @property {string} id
 * @property {string} name
 * @property {'checking'|'savings'|'cash'|'other'} type  Où se trouve l'argent
 * @property {boolean} isSavings  Compte compté comme épargne (ex. livret, mais aussi « épargne liquide »)
 * @property {number} openingBalanceCents  Solde au début de openingDate
 * @property {string} openingDate  Les opérations antérieures à cette date sont considérées comme déjà incluses
 * @property {boolean} active
 * @property {number} order
 *
 * @typedef {Object} Category
 * @property {string} id
 * @property {string} name
 * @property {'expense'|'income'} kind
 * @property {boolean} active
 *
 * @typedef {Object} Transaction
 * @property {string} id
 * @property {'income'|'expense'|'transfer'} type
 * @property {string} date
 * @property {number} amountCents  Toujours > 0
 * @property {'planned'|'done'} status  Seules les opérations 'done' modifient les soldes
 * @property {string} [accountId]  income / expense
 * @property {string} [fromAccountId]  transfer
 * @property {string} [toAccountId]  transfer
 * @property {string|null} [categoryId]  null pour un transfert
 * @property {string} description
 * @property {string|null} [ruleId]  Renseigné = charge fixe (ou revenu récurrent) issue d'une règle
 *
 * @typedef {Object} Rule
 * @property {string} id
 * @property {string} name
 * @property {'income'|'fixed_expense'} kind
 * @property {number} amountCents
 * @property {'monthly'} frequency
 * @property {number} day  Jour du mois (31 → dernier jour des mois courts)
 * @property {string} accountId
 * @property {string|null} categoryId
 * @property {string} startDate
 * @property {string|null} endDate
 * @property {boolean} active
 *
 * @typedef {Object} Budget  Budget récurrent variable : une enveloppe, jamais une limite bloquante
 * @property {string} id
 * @property {string} name
 * @property {number} monthlyCents
 * @property {string} categoryId  Une seule catégorie par budget (MVP)
 * @property {boolean} active
 *
 * @typedef {Object} SavingsPlan  Épargne programmée (théorique)
 * @property {'percent'|'fixed'} mode
 * @property {number} basisPoints  2000 = 20 %
 * @property {number} fixedCents
 * @property {'projected'|'received'} base  Revenu servant au calcul du pourcentage (défaut MVP : 'received')
 * @property {string|null} [targetAccountId]  Suggestion pour l'interface, ignorée par le calcul
 * @property {boolean} active
 *
 * @typedef {Object} MonthClosure  Instantané figé ; aucune transaction n'est supprimée
 * @property {string} monthKey
 * @property {string} closedAt
 * @property {number} extraSavingsCents  Épargne supplémentaire confirmée
 * @property {number} realSavingsCents  Transférée nette + supplémentaire confirmée
 * @property {number|null} savingsRateBp
 * @property {number|null} targetRateBp
 * @property {number} pendingPlannedCount
 * @property {Object} snapshot
 *
 * @typedef {Object} Settings
 * @property {number} schemaVersion
 * @property {number} startDay  Prévu pour plus tard ; le MVP n'accepte que 1 (mois civil)
 *
 * @typedef {Object} AppState
 * @property {Account[]} accounts
 * @property {Category[]} categories
 * @property {Transaction[]} transactions
 * @property {Rule[]} rules
 * @property {Budget[]} budgets
 * @property {SavingsPlan|null} savingsPlan
 * @property {MonthClosure[]} closures
 * @property {Settings} settings
 */

/** @returns {AppState} */
export function emptyState() {
  return { accounts: [], categories: [], transactions: [], rules: [], budgets: [],
    savingsPlan: null, closures: [], settings: { schemaVersion: SCHEMA_VERSION, startDay: 1 } };
}

export const newId = () => globalThis.crypto.randomUUID();

/** @returns {SavingsPlan} Plan par défaut du MVP : 20 % du revenu REÇU. */
export const defaultSavingsPlan = () => ({ mode: 'percent', basisPoints: 2000, fixedCents: 0, base: 'received', targetAccountId: null, active: true });
