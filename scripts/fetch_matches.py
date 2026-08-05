"""Exporte des matchs réels (SportMonks) vers un fichier JSON normalisé.

Ce script est la première brique du pipeline cible :
API brut -> normalisation -> fichier JSON -> (validation humaine) -> interface.

Il ne modifie jamais le site directement : il produit un fichier que vous
pouvez relire avant de l'utiliser. Rien n'est publié automatiquement.

Usage :
    export SPORTMONKS_API_TOKEN='votre-token'
    python scripts/fetch_matches.py --league "Premier League" \
        --season 2024 --date-from 2025-02-01 --date-to 2025-02-03 \
        --out data/matches/premier-league-2025-02-01_2025-02-03.json

Sans --date-from/--date-to, le script échoue explicitement : SportMonks
exige une plage de dates pour l'endpoint fixtures/between utilisé ici.
"""

from __future__ import annotations

import argparse
from dataclasses import asdict
from datetime import date, datetime
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from sportlab.config import ConfigurationError, Settings  # noqa: E402
from sportlab.providers.sportmonks import ProviderError, SportMonksProvider  # noqa: E402


def _json_default(value):
    if isinstance(value, datetime | date):
        return value.isoformat()
    raise TypeError(f"Type non sérialisable: {type(value)!r}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--league", required=True, help="Nom exact de la compétition (ex: 'Premier League')")
    parser.add_argument("--season", type=int, required=True, help="Année de la saison (ex: 2024 pour 2024-25)")
    parser.add_argument("--date-from", required=True, type=date.fromisoformat)
    parser.add_argument("--date-to", required=True, type=date.fromisoformat)
    parser.add_argument("--out", required=True, help="Chemin du fichier JSON de sortie")
    args = parser.parse_args()

    try:
        settings = Settings.from_env()
        provider = SportMonksProvider(settings)

        print(f"Recherche de la compétition « {args.league} »...")
        competitions = provider.competitions()
        matches_league = [c for c in competitions if c.name.lower() == args.league.lower()]
        if not matches_league:
            available = ", ".join(c.name for c in competitions)
            print(f"Compétition introuvable dans votre abonnement. Disponibles : {available}")
            return 1
        competition = matches_league[0]
        print(f"Trouvée : {competition.name} ({competition.id}, {competition.country})")

        print(f"Récupération des matchs du {args.date_from} au {args.date_to}...")
        matches = provider.matches(
            competition_id=competition.id,
            season=args.season,
            date_from=args.date_from,
            date_to=args.date_to,
        )
        print(f"{len(matches)} match(s) récupéré(s).")

    except ConfigurationError as exc:
        print(f"Configuration manquante : {exc}")
        return 1
    except ProviderError as exc:
        print(f"Erreur SportMonks : {exc}")
        return 1

    payload = {
        "competition": asdict(competition),
        "matches": [asdict(m) for m in matches],
        "exported_at": datetime.now().isoformat(),
        "note": "Données brutes normalisées, non validées humainement. À relire avant usage éditorial.",
    }

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False, default=_json_default), encoding="utf-8"
    )
    print(f"Écrit : {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
