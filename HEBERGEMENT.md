# Héberger SportLab et automatiser les données — sans terminal

Ce guide explique comment mettre le site en ligne et faire en sorte que les
données SportMonks se mettent à jour toutes seules, chaque jour, sans que
vous ayez à ouvrir un terminal. Tout se fait en cliquant dans des pages web.

Temps estimé : 15 à 20 minutes, une seule fois.

## Ce qu'on met en place

- **GitHub** : héberge le code du site et fait tourner le robot de collecte.
- **GitHub Pages** : héberge le site lui-même, gratuitement, à une adresse
  du type `https://votre-pseudo.github.io/nom-du-projet/`.
- **GitHub Actions** : le robot programmé. Il se réveille chaque jour à
  6h00 (heure UTC), va chercher les derniers matchs sur SportMonks, et met
  à jour le fichier `data/matches.json`. Le site affiche ensuite ce fichier.
- **Un secret GitHub** : votre token SportMonks, stocké de façon chiffrée.
  Il n'apparaît jamais dans le code du site ni dans une page visible.

## Étape 1 — Créer un compte GitHub

Si vous n'en avez pas déjà un : allez sur [github.com](https://github.com),
cliquez sur « Sign up », suivez les instructions. C'est gratuit.

## Étape 2 — Créer un nouveau dépôt (repository)

1. Une fois connecté, cliquez sur le bouton **+** en haut à droite, puis
   **New repository**.
2. Nom du dépôt : par exemple `factxi-sportlab`.
3. Laissez-le en **Public** (le code n'a rien de sensible — votre token,
   lui, ne sera jamais dans le code, voir étape 4).
4. Ne cochez aucune case d'initialisation (pas de README, pas de .gitignore
   — on va tout envoyer nous-mêmes).
5. Cliquez sur **Create repository**.

## Étape 3 — Envoyer les fichiers du projet

1. Sur la page de votre nouveau dépôt vide, cliquez sur le lien
   **uploading an existing file** (ou **Add file > Upload files**).
2. Ouvrez le dossier du projet sur votre Mac (celui que vous avez dézippé),
   sélectionnez **tout son contenu** (tous les fichiers et dossiers visibles
   à l'intérieur, pas le dossier lui-même), et glissez-les dans la zone
   d'upload de GitHub.
3. Important : le dossier `.github` (qui contient le robot) est caché par
   défaut sur Mac. Pour le voir dans le Finder, appuyez sur
   `Cmd + Shift + .` (point) une fois dans le dossier du projet — les
   fichiers/dossiers cachés apparaissent. Vérifiez que `.github` fait bien
   partie de ce que vous glissez.
4. En bas de page, ajoutez un message court (ex : "Premier envoi") et
   cliquez sur **Commit changes**.

## Étape 4 — Ajouter votre token SportMonks comme secret

1. Dans votre dépôt, allez dans **Settings** (onglet en haut).
2. Dans le menu de gauche : **Secrets and variables > Actions**.
3. Cliquez sur **New repository secret**.
4. Nom : `SPORTMONKS_API_TOKEN` (exactement, avec les majuscules).
5. Valeur : collez votre token SportMonks.
6. Cliquez sur **Add secret**.

À partir de maintenant, ce token est chiffré et invisible — même vous ne
pourrez plus le relire depuis cette page, seul le robot peut l'utiliser.

## Étape 5 — Activer GitHub Pages

1. Toujours dans **Settings**, menu de gauche : **Pages**.
2. Sous **Build and deployment > Source**, choisissez **Deploy from a
   branch**.
3. Sous **Branch**, choisissez `main` et `/ (root)`, puis **Save**.
4. Attendez une minute ou deux. L'adresse de votre site apparaît en haut de
   cette même page (`https://votre-pseudo.github.io/factxi-sportlab/`).

## Étape 6 — Lancer le robot une première fois manuellement

Il tourne automatiquement chaque jour, mais autant vérifier que tout marche
tout de suite plutôt que d'attendre le lendemain matin.

1. Allez dans l'onglet **Actions** de votre dépôt.
2. Cliquez sur **Mettre à jour les données SportMonks** dans la liste à
   gauche.
3. Cliquez sur le bouton **Run workflow** (à droite), puis à nouveau
   **Run workflow** dans le petit menu qui s'ouvre.
4. Attendez 30 secondes à une minute, rechargez la page. Un rond vert ✓
   signifie que ça a marché. Un rond rouge ✗ signifie une erreur — cliquez
   dessus pour voir le message, et copiez-le-moi si besoin.

## Étape 7 — Vérifier le résultat

Ouvrez l'adresse de votre site (étape 5) dans votre navigateur. Les matchs
affichés doivent maintenant porter la mention « Donnée réelle · mise à jour
auto » plutôt que la date figée du 05/08.

## Et ensuite ?

- Le robot tourne tout seul chaque matin. Vous n'avez plus rien à faire.
- Si vous voulez des données plus fraîches immédiatement, refaites
  l'étape 6 (un clic).
- Si vous modifiez le site (nouveaux fichiers HTML/CSS/JS que je vous
  donnerai), il faudra les renvoyer via **Add file > Upload files** comme à
  l'étape 3 — toujours sans terminal.
