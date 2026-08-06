"""Récupère automatiquement les matchs des compétitions couvertes par
l'abonnement SportMonks : la liste (résumé) dans data/matches.json, et le
détail complet (compositions, événements, statistiques, xG) de chaque match
terminé dans data/match-detail-<id>.json.

Conçu pour tourner sans interaction humaine, déclenché automatiquement par
.github/workflows/update-data.yml. Peut aussi être lancé à la main en local
pour tester (voir README.md).

Fenêtre de dates : 45 jours dans le passé, 45 jours dans le futur, à partir
d'aujourd'hui. Ajustez WINDOW_DAYS_PAST / WINDOW_DAYS_FUTURE si besoin.

Le détail complet n'est récupéré qu'une fois par match (fichier déjà présent
= pas re-téléchargé), pour ne pas gaspiller le quota de requêtes sur des
matchs déjà connus.
"""

from __future__ import annotations

from dataclasses import asdict
from datetime import UTC, date, datetime, timedelta
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from sportlab.config import ConfigurationError, Settings  # noqa: E402
from sportlab.providers.sportmonks import ProviderError, SportMonksProvider  # noqa: E402

WINDOW_DAYS_PAST = 45
WINDOW_DAYS_FUTURE = 45
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
OUT_PATH = DATA_DIR / "matches.json"

DETAIL_INCLUDES = (
    "participants;scores;state;venue;round;coaches.country;"
    "events.type;events.period;events.player;"
    "lineups.player.country;lineups.details;lineups.xGlineup;"
    "statistics.type;"
    "xGFixture;pressure"
)

# Le match de référence du projet (Arsenal-Manchester City, sur lequel tout le
# MatchLab a été construit et vérifié) doit toujours rester disponible, même
# quand la fenêtre glissante ("aujourd'hui" +/- 45 jours) ne le couvre plus.
# On le récupère systématiquement en plus, et on fusionne sans doublon.
ANCHOR_WINDOWS = {
    "Premier League": {"date_from": date(2025, 2, 1), "date_to": date(2025, 2, 3), "season": 2024},
}


def season_for(d: date) -> int:
    """Convention du football européen : une saison commence en juillet."""
    return d.year if d.month >= 7 else d.year - 1


def _json_default(value):
    if isinstance(value, datetime | date):
        return value.isoformat()
    raise TypeError(f"Type non sérialisable: {type(value)!r}")


def _fixture_id_from(match_id: str) -> str:
    return match_id.removeprefix("sportmonks:fixture:")


def fetch_match_details(provider: SportMonksProvider, matches: list) -> None:
    """Récupère le détail complet de chaque match terminé, sauf s'il existe déjà."""
    for m in matches:
        if m.status.value != "finished":
            continue
        fixture_id = _fixture_id_from(m.id)
        out_path = DATA_DIR / f"match-detail-{fixture_id}.json"
        if out_path.exists():
            continue
        print(f"  Détail du match {fixture_id} ({m.home.name} - {m.away.name})...")
        try:
            raw = provider.get_raw_fixture(fixture_id, include=DETAIL_INCLUDES)
        except ProviderError as exc:
            print(f"    Erreur : {exc} (ignoré, réessaiera demain)")
            continue
        payload = {
            "fetched_at": datetime.now(UTC).isoformat(),
            "fixture_id": fixture_id,
            "includes_requested": DETAIL_INCLUDES,
            "note": "Récupéré automatiquement par le robot quotidien.",
            "raw": raw,
        }
        out_path.write_text(
            json.dumps(payload, indent=2, ensure_ascii=False, default=_json_default),
            encoding="utf-8",
        )
        print(f"    Écrit : {out_path}")


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

    today = datetime.now(UTC).date()
    date_from = today - timedelta(days=WINDOW_DAYS_PAST)
    date_to = today + timedelta(days=WINDOW_DAYS_FUTURE)
    season = season_for(today)

    result: dict = {
        "generated_at": datetime.now(UTC).isoformat(),
        "window": {"from": date_from.isoformat(), "to": date_to.isoformat()},
        "competitions": [],
    }

    for competition in competitions:
        print(f"{competition.name}: récupération {date_from} -> {date_to}...")
        try:
            matches = provider.matches(
                competition_id=competition.id,
                season=season,
                date_from=date_from,
                date_to=date_to,
            )
        except ProviderError as exc:
            print(f"  Erreur pour {competition.name}: {exc} (compétition ignorée)")
            continue
        print(f"  {len(matches)} match(s)")

        anchor = ANCHOR_WINDOWS.get(competition.name)
        if anchor:
            print(f"  + fenêtre de référence {anchor['date_from']} -> {anchor['date_to']}...")
            try:
                anchor_matches = provider.matches(
                    competition_id=competition.id,
                    season=anchor["season"],
                    date_from=anchor["date_from"],
                    date_to=anchor["date_to"],
                )
                existing_ids = {m.id for m in matches}
                added = 0
                for m in anchor_matches:
                    if m.id not in existing_ids:
                        matches.append(m)
                        added += 1
                print(f"    {added} match(s) de référence ajouté(s) (hors doublons)")
            except ProviderError as exc:
                print(f"    Erreur sur la fenêtre de référence: {exc} (ignorée)")

        result["competitions"].append(
            {
                "competition": asdict(competition),
                "matches": [asdict(m) for m in matches],
            }
        )

        fetch_match_details(provider, matches)

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(
        json.dumps(result, indent=2, ensure_ascii=False, default=_json_default),
        encoding="utf-8",
    )
    print(f"Écrit : {OUT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
