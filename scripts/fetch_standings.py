"""Récupère le classement et les meilleurs buteurs/passeurs/cartons de chaque
compétition couverte par l'abonnement, et écrit :
  - data/standings-<league_id>.json
  - data/topscorers-<league_id>.json

Conçu pour tourner sans interaction (déclenché par GitHub Actions), mais
peut être lancé à la main pour tester.

Contrairement au détail des matchs (append-only), classement et buteurs
changent après chaque journée : on les réécrit à chaque passage, pas de
cache "déjà présent = pas retéléchargé" ici.
"""

from __future__ import annotations

from dataclasses import asdict
from datetime import UTC, date, datetime
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from sportlab.config import ConfigurationError, Settings  # noqa: E402
from sportlab.providers.sportmonks import ProviderError, SportMonksProvider  # noqa: E402

DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def _json_default(value):
    if isinstance(value, datetime | date):
        return value.isoformat()
    raise TypeError(f"Type non sérialisable: {type(value)!r}")


def main() -> int:
    try:
        settings = Settings.from_env()
        provider = SportMonksProvider(settings)
        competitions = provider.competitions()
    except ConfigurationError as exc:
        print(f"Configuration manquante : {exc}")
        return 1
    except ProviderError as exc:
        print(f"Erreur SportMonks (compétitions) : {exc}")
        return 1

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    for competition in competitions:
        league_id = competition.id.removeprefix("sportmonks:league:")
        if not competition.current_season_id:
            print(f"{competition.name}: pas de saison en cours identifiée, ignoré.")
            continue

        print(f"{competition.name}: classement (saison {competition.current_season_id})...")
        try:
            standings = provider.get_raw_standings(competition.current_season_id)
        except ProviderError as exc:
            print(f"  Erreur classement : {exc}")
            standings = None

        if standings is not None:
            payload = {
                "fetched_at": datetime.now(UTC).isoformat(),
                "competition": asdict(competition),
                "season_id": competition.current_season_id,
                "standings": standings,
            }
            out = DATA_DIR / f"standings-{league_id}.json"
            out.write_text(
                json.dumps(payload, indent=2, ensure_ascii=False, default=_json_default),
                encoding="utf-8",
            )
            print(f"  Écrit : {out}")

        print(f"{competition.name}: buteurs/passeurs...")
        try:
            topscorers = provider.get_raw_topscorers(competition.current_season_id)
        except ProviderError as exc:
            print(f"  Erreur buteurs : {exc}")
            topscorers = None

        if topscorers is not None:
            payload = {
                "fetched_at": datetime.now(UTC).isoformat(),
                "competition": asdict(competition),
                "season_id": competition.current_season_id,
                "topscorers": topscorers,
            }
            out = DATA_DIR / f"topscorers-{league_id}.json"
            out.write_text(
                json.dumps(payload, indent=2, ensure_ascii=False, default=_json_default),
                encoding="utf-8",
            )
            print(f"  Écrit : {out}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
