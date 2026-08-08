"""Récupère le détail complet d'un match précis (compositions, événements,
statistiques, xG) et l'écrit dans data/match-detail-<id>.json.

Conçu pour être déclenché manuellement via GitHub Actions
(.github/workflows/fetch-match-detail.yml), avec l'ID de match en paramètre.
Peut aussi être lancé en local pour tester.

Usage :
    export SPORTMONKS_API_TOKEN='...'
    python scripts/fetch_match_detail.py --fixture-id 19134564

Avertissement honnête : les noms de champs pour lineups/events/statistics/
xGFixture viennent de la documentation publique SportMonks, pas d'une
réponse réelle vérifiée à ce niveau de détail. Le script imprime la
réponse brute complète en plus du résumé, pour qu'on puisse corriger
rapidement si un nom de champ diffère.
"""

from __future__ import annotations

import argparse
from dataclasses import asdict
from datetime import UTC, date, datetime
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from sportlab.config import ConfigurationError, Settings  # noqa: E402
from sportlab.providers.sportmonks import ProviderError, SportMonksProvider  # noqa: E402

INCLUDES = (
    "participants;scores;state;venue;round;coaches.country;"
    "events.type;events.period;events.player;"
    "lineups.player.country;lineups.details.type;lineups.xGlineup;"
    "statistics.type;"
    "xGFixture;pressure;weatherReport"
)


def _json_default(value):
    if isinstance(value, datetime | date):
        return value.isoformat()
    raise TypeError(f"Type non sérialisable: {type(value)!r}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fixture-id", required=True, help="ID du match SportMonks (ex: 19134564)")
    parser.add_argument("--out", default=None, help="Chemin de sortie (défaut: data/match-detail-<id>.json)")
    args = parser.parse_args()

    out_path = Path(args.out) if args.out else (
        Path(__file__).resolve().parent.parent / "data" / f"match-detail-{args.fixture_id}.json"
    )

    try:
        settings = Settings.from_env()
        provider = SportMonksProvider(settings)
        raw = provider.get_raw_fixture(args.fixture_id, include=INCLUDES)
    except ConfigurationError as exc:
        print(f"Configuration manquante : {exc}")
        return 1
    except ProviderError as exc:
        print(f"Erreur SportMonks : {exc}")
        return 1

    if not raw:
        print("Aucune donnée retournée pour cet ID de match.")
        return 1

    payload = {
        "fetched_at": datetime.now(UTC).isoformat(),
        "fixture_id": args.fixture_id,
        "includes_requested": INCLUDES,
        "note": (
            "Réponse brute SportMonks, non simplifiée. À relire avant tout usage éditorial. "
            "Si certains champs demandés (lineups, events, statistics, xGFixture) sont absents, "
            "c'est probablement une question de couverture d'abonnement pour cette compétition."
        ),
        "raw": raw,
    }

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False, default=_json_default), encoding="utf-8"
    )
    print(f"Écrit : {out_path}")

    # Résumé lisible dans les logs, pour vérifier vite fait sans ouvrir le fichier.
    present = [k for k in ("lineups", "events", "statistics", "xGFixture", "venue", "round", "coaches") if k in raw]
    missing = [k for k in ("lineups", "events", "statistics", "xGFixture", "venue", "round", "coaches") if k not in raw]
    print(f"Champs présents : {present}")
    print(f"Champs absents (non couverts par l'abonnement, ou nom différent) : {missing}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
