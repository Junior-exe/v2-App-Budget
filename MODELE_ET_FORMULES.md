# Cœur financier — modèle et formules (Phase 0)

Règles générales : centimes entiers positifs (le type donne le sens) · dates `AAAA-MM-JJ` · mois civil `AAAA-MM` · soldes jamais stockés · fonctions pures (aucune ne modifie ses données).

## Deux questions, deux modules
- `balances.js` : **où est l'argent ?** Solde réel par compte.
- `month.js` : **que puis-je dépenser ?** Budget, argent libre, épargne, reste à engager, clôture.

## Solde d'un compte
`solde = solde initial + revenus réalisés − dépenses réalisées + transferts entrants − transferts sortants`
- Seules les opérations `done` comptent. Un revenu ou un transfert `planned` ne change jamais un solde.
- Les opérations antérieures à `openingDate` sont ignorées (déjà dans le solde initial).
- Total = comptes actifs. Un transfert ne change pas le total.

## Revenus du mois
- **reçu** = revenus `done` · **prévu restant** = revenus `planned` · **projeté** = reçu + prévu restant

## Classement des dépenses d'un mois
1. **Charge fixe** : dépense avec `ruleId` (réalisée ou prévue).
2. **Dépense de budget** : dépense réalisée, sans `ruleId`, dont la catégorie a un budget actif.
3. **Dépense libre** : dépense réalisée, sans `ruleId`, hors budget (catégorie vide comprise).
4. **Transfert** : jamais une dépense ni un revenu.

## Budgets
`dépassement = max(0, dépensé − budget)` · `restant = max(0, budget − dépensé)`

## Épargne
- **programmée** = pourcentage × **revenu reçu** (défaut MVP ; `base: 'projected'` reste possible) ou montant fixe.
- **transférée** = transferts réalisés d'un compte non-épargne vers un compte `isSavings` ; **retirée** = l'inverse.
- **transférée nette** = transférée − retirée (ex. +500 − 200 = 300).
- **restante à transférer** = max(0, programmée − transférée nette).
- **supplémentaire confirmée** : saisie à la clôture seulement.
- Pour la projection, l'épargne en pourcentage est aussi calculée sur le revenu projeté (`plannedProjectedCents`).

## Argent libre
```
engagé              = charges fixes (réalisées + prévues) + épargne programmée + budgets réservés
libre actuel (brut) = revenu REÇU − engagé − dépenses libres − dépassements   (peut être négatif)
libre projeté       = revenu projeté − engagé (épargne sur revenu projeté) − dépenses libres − dépassements
```
Présentation pour l'interface (`free.position`), jamais de valeur négative brute :
- **disponible actuellement** = max(0, libre actuel)
- **engagements restant à couvrir** = max(0, −libre actuel) : part des engagements que le revenu reçu ne couvre pas encore
- **disponible projeté** = libre projeté, après les revenus prévus

## Reste à engager
Charges fixes encore prévues (avec détail) + épargne restante à transférer. (Différent des « engagements restant à couvrir ».)

## Clôture
- Deux montants **explicites et obligatoires** : `extraFromFreeCents` (≤ disponible actuellement) et `extraFromUnspentBudgetsCents` (≤ budgets non dépensés). Rien n'est ajouté automatiquement.
- `épargne réelle = transférée nette + supplémentaire confirmée`
- `taux réel = épargne réelle / revenu reçu` (points de base : 2684 = 26,8 %)
- Aucune transaction supprimée ; instantané figé dans `MonthClosure`.

## Couche data/
- `store.js` : IndexedDB (7 magasins), écritures atomiques, `replaceAll` tout-ou-rien, demande de stockage persistant.
- `backup.js` : fichier `{ app, schemaVersion, exportedAt, data }`, migrations en chaîne, refus d'une version plus récente, `prepareImport` (lecture sans rien modifier), `applyImport` (confirmation obligatoire + sauvegarde de sécurité des données remplacées), âge de la dernière sauvegarde.
- `validate.js` : intégrité complète avant tout import (doublons, références, montants entiers, transferts, un budget actif par catégorie).

## Reporté
Dépenses prévues hors règle → Phase 4 · type `adjustment` → réconciliation · tests 5 et 6 complets → simulation.

## Saisie des opérations (core/entities.js + data/repository.js)
- **Dépense** : − sur le compte. **Revenu** : + sur le compte. **Transfert** : − source, + destination, jamais de catégorie, jamais revenu ni dépense. Retrait d'espèces et retrait d'épargne = transferts.
- Catégorie facultative ; son type doit correspondre (dépense/revenu). Sans catégorie ou hors budget = dépense libre.
- Compte désactivé : plus proposé pour une nouvelle opération ; ses opérations existantes restent modifiables. Son solde n'est plus compté dans le total (avertissement si ≠ 0).
- Type d'une catégorie non modifiable. Noms uniques par type (comptes : uniques).
- Mois clôturé : création, modification et suppression refusées.
- Avertissements (confirmation demandée, rien d'enregistré avant) : opération réalisée antérieure au solde initial du compte, déplacement de la date du solde initial excluant des opérations, désactivation d'un compte non vide.
- Le montant est saisi en euros ("12,50") et converti en centimes par core/money.js.
