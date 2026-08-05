# SportLab v0.1 — FACT XI

SportLab est le socle de collecte, normalisation et traçabilité des données football de
FACT XI. API-Football est le premier fournisseur, mais le code métier dépend du contrat
`FootballDataProvider` : un adaptateur SportMonks ou une source publique pourra être ajouté
sans modifier le modèle normalisé.

## Interface web

Ouvrez directement `index.html` dans un navigateur. L'accueil permet de choisir une
compétition, une saison et un club avant d'ouvrir `match.html`. L'interface fonctionne sans
installation et présente des données de démonstration tant que la clé API-Football n'est pas
configurée. L'état détaillé de la v0.1 figure dans `docs/v0.1-status.md`.

## Ce que contient ce premier socle

- configuration par variables d'environnement, sans secret versionné ;
- client API-Football v3 avec erreurs explicites et délai configurable ;
- normalisation minimale des compétitions et des matchs ;
- identifiants qualifiés par fournisseur pour éviter les collisions ;
- traçabilité attachée à chaque objet : fournisseur, endpoint, date UTC de collecte,
  périmètre exact, identifiants d'origine et champ de méthode de calcul ;
- tests entièrement hors ligne, avec réponses API simulées.

Le champ `calculation` de `SourceTrace` reste vide pour une donnée directement observée. Une
future statistique calculée devra y inscrire une description versionnée de la méthode et
conserver les objets sources utilisés.

## Démarrage local

Prérequis : Python 3.11 ou plus récent.

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -e .
cp .env.example .env
python -m unittest discover -s tests
```

Le fichier `.env` n'est pas chargé automatiquement : cela évite une dépendance et toute
lecture implicite de secrets. Pour un futur appel réel, exportez la variable dans le terminal :

```bash
export API_FOOTBALL_KEY='votre-cle'
```

Puis construisez le fournisseur à partir de l'environnement :

```python
from sportlab import ApiFootballProvider, Settings

provider = ApiFootballProvider(Settings.from_env())
ligue_1 = provider.competitions(country="France")
```

Sans `API_FOOTBALL_KEY`, le client s'arrête avant d'ouvrir une connexion réseau.

## Ajouter un fournisseur

Créer un nouvel adaptateur héritant de `FootballDataProvider`, puis convertir ses réponses
vers les objets de `sportlab.models`. Le code consommateur ne doit pas lire les réponses
brutes d'un fournisseur. Chaque objet normalisé doit conserver un `SourceTrace` complet.

## Périmètre et limites de la v0.1

Ce socle ne stocke pas encore les données et ne calcule aucune statistique éditoriale. Il
n'effectue ni pagination ni cache et couvre seulement les endpoints `/leagues` et `/fixtures`.
La structure est volontairement petite : le prochain incrément sera choisi à partir d'un
premier besoin éditorial réel, afin de ne pas multiplier les endpoints sans valeur démontrée.

## Première action attendue de l'utilisateur

Aucune action n'est nécessaire pour installer et tester le projet. Une clé API-Football ne
sera nécessaire qu'au moment de valider la première collecte réelle. À ce moment-là, elle
devra être placée dans `API_FOOTBALL_KEY` localement et ne jamais être envoyée dans le dépôt.
