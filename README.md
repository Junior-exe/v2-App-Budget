Budget personnel — mode d'emploi rapide
Lancer les tests

npm install puis npm test (Node 20 ou plus récent).

Essayer sur un téléphone Android

Une PWA doit être servie en HTTPS pour s'installer et fonctionner hors ligne.

Créer un dépôt GitHub et y déposer tout ce dossier (sauf node_modules).
Dépôt → Settings → Pages → déployer la branche principale, dossier racine.
Ouvrir l'adresse obtenue dans Chrome sur le téléphone → menu ⋮ → « Installer l'application ». Les données restent sur le téléphone ; seul le code est publié.
Mise à jour du code

Après toute modification, changer CACHE dans sw.js (ex. budget-v2), sinon l'ancienne version reste en cache.
