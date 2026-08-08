"""Récupère l'intégralité d'une saison précise (fixtures + détail complet de
chaque match terminé) pour une ou plusieurs compétitions.

Contrairement à fetch_all.py (fenêtre glissante de 90 jours autour
d'aujourd'hui), ce script cible une saison passée entière — utile pour tester
les briques qui ont besoin d'historique profond (buteurs, séries en cours,
meilleurs joueurs) sans attendre que la saison en cours avance.

Usage :
    python3 scripts/fetch_season.py --season-name "2025/2026"

Même logique d'append que fetch_all.py : un match déjà présent en cache
n'est jamais retéléchargé, donc relancer ce script plusieurs fois ne coûte
rien de plus que la première fois (hors nouveaux matchs).
"""

from __future__ import annotations

import argparse
from dataclasses import asdict
from datetime import UTC, date, datetime, timedelta
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from sportlab.config import ConfigurationError, Settings  # noqa: E402
from sportlab.providers.sportmonks import ProviderError, SportMonksProvider  # noqa: E402

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

DETAIL_INCLUDES = (
    "participants;scores;state;venue;round;coaches.country;"
    "events.type;events.period;events.player;"
    "lineups.player.country;lineups.player.position;lineups.details.type;lineups.xGlineup;"
    "statistics.type;"
    "xGFixture;pressure;weatherReport"
)


def _json_default(value):
    if isinstance(value, datetime | date):
        return value.isoformat()
    raise TypeError(f"Type non sérialisable: {type(value)!r}")


def _fixture_id_from(match_id: str) -> str:
    return match_id.removeprefix("sportmonks:fixture:")


def _parse_season_dates(season_row: dict) -> tuple[date, date] | None:
    start = season_row.get("starting_at")
    end = season_row.get("ending_at")
    if not start or not end:
        return None
    return date.fromisoformat(start[:10]), date.fromisoformat(end[:10])


def _date_chunks(date_from: date, date_to: date, max_days: int = 90) -> list[tuple[date, date]]:
    """Découpe une plage de dates en tranches de `max_days` jours maximum.

    SportMonks limite /fixtures/between à 100 jours par appel. On utilise 90
    plutôt que 100 pour garder une marge de sécurité, pas pour économiser des
    requêtes (une saison de ~282 jours fait de toute façon 3-4 tranches, le
    coût réel est négligeable face au quota journalier).
    """
    chunks = []
    start = date_from
    while start <= date_to:
        end = min(start + timedelta(days=max_days - 1), date_to)
        chunks.append((start, end))
        start = end + timedelta(days=1)
    return chunks


def fetch_match_details(provider: SportMonksProvider, matches: list) -> int:
    written = 0
    for m in matches:
        if m.status.value != "finished":
            continue
        fixture_id = _fixture_id_from(m.id)
        out_path = DATA_DIR / f"match-detail-{fixture_id}.json"
        if out_path.exists():
            continue
        try:
            raw = provider.get_raw_fixture(fixture_id, include=DETAIL_INCLUDES)
        except ProviderError as exc:
            print(f"    Erreur détail {fixture_id} : {exc} (ignoré)")
            continue
        payload = {
            "fetched_at": datetime.now(UTC).isoformat(),
            "fixture_id": fixture_id,
            "includes_requested": DETAIL_INCLUDES,
            "note": "Récupéré par fetch_season.py (backfill historique).",
            "raw": raw,
        }
        out_path.write_text(
            json.dumps(payload, indent=2, ensure_ascii=False, default=_json_default),
            encoding="utf-8",
        )
        written += 1
    return written


def _season_slug(season_name: str) -> str:
    # "2025/2026" -> "2025-2026", pour un nom de fichier valide sur tous les OS.
    return season_name.replace("/", "-")


def fetch_season_standings_and_topscorers(
    provider: SportMonksProvider, competition, season_id: int, season_name: str
) -> None:
    """Récupère classement + buteurs/passeurs pour UNE saison précise (pas
    forcément la saison en cours) et les écrit dans des fichiers dédiés,
    distincts de ceux de la fenêtre glissante quotidienne.
    """
    league_id = int(competition.id.removeprefix("sportmonks:league:"))
    slug = _season_slug(season_name)

    standings_path = DATA_DIR / f"standings-{league_id}-{slug}.json"
    if not standings_path.exists():
        try:
            rows = provider.get_raw_standings(season_id)
            payload = {
                "fetched_at": datetime.now(UTC).isoformat(),
                "competition": asdict(competition),
                "season_id": season_id,
                "season_name": season_name,
                "standings": rows,
            }
            standings_path.write_text(
                json.dumps(payload, indent=2, ensure_ascii=False, default=_json_default),
                encoding="utf-8",
            )
            print(f"  Classement saison {season_name} écrit ({len(rows)} ligne(s)).")
        except ProviderError as exc:
            print(f"  Erreur classement saison {season_name} : {exc}")
    else:
        print(f"  Classement saison {season_name} déjà présent, ignoré.")

    topscorers_path = DATA_DIR / f"topscorers-{league_id}-{slug}.json"
    if not topscorers_path.exists():
        try:
            rows = provider.get_raw_topscorers(season_id)
            payload = {
                "fetched_at": datetime.now(UTC).isoformat(),
                "competition": asdict(competition),
                "season_id": season_id,
                "season_name": season_name,
                "topscorers": rows,
            }
            topscorers_path.write_text(
                json.dumps(payload, indent=2, ensure_ascii=False, default=_json_default),
                encoding="utf-8",
            )
            print(f"  Buteurs/passeurs saison {season_name} écrits ({len(rows)} ligne(s)).")
        except ProviderError as exc:
            print(f"  Erreur buteurs/passeurs saison {season_name} : {exc}")
    else:
        print(f"  Buteurs/passeurs saison {season_name} déjà présents, ignorés.")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--season-name",
        default="2025/2026",
        help="Nom de saison tel que renvoyé par SportMonks (ex: '2025/2026').",
    )
    parser.add_argument(
        "--competition",
        action="append",
        help="Nom de compétition à cibler (répétable). Par défaut : toutes les compétitions couvertes.",
    )
    args = parser.parse_args()

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
    history_entries: list[dict] = []

    for competition in competitions:
        if args.competition and competition.name not in args.competition:
            continue
        league_id = int(competition.id.removeprefix("sportmonks:league:"))
        print(f"{competition.name}: recherche de la saison '{args.season_name}'...")
        try:
            seasons = provider.get_raw_seasons(league_id)
        except ProviderError as exc:
            print(f"  Erreur récupération des saisons : {exc}")
            continue

        target = next((s for s in seasons if s.get("name") == args.season_name), None)
        if not target:
            available = [s.get("name") for s in seasons]
            print(f"  Saison '{args.season_name}' introuvable. Disponibles : {available}")
            continue

        dates = _parse_season_dates(target)
        if not dates:
            print(f"  Dates de saison introuvables dans la réponse pour {competition.name}, ignoré.")
            continue
        date_from, date_to = dates
        season_year = date_from.year if date_from.month >= 7 else date_from.year - 1

        print(f"  Saison trouvée (id {target['id']}) : {date_from} -> {date_to}")
        chunks = _date_chunks(date_from, date_to)
        if len(chunks) > 1:
            print(f"  Plage de {(date_to - date_from).days + 1} jours > limite SportMonks (100) : {len(chunks)} tranches.")
        matches: list = []
        seen_ids: set[str] = set()
        for chunk_from, chunk_to in chunks:
            try:
                chunk_matches = provider.matches(
                    competition_id=competition.id,
                    season=season_year,
                    date_from=chunk_from,
                    date_to=chunk_to,
                )
            except ProviderError as exc:
                print(f"  Erreur récupération des matchs ({chunk_from} -> {chunk_to}) : {exc}")
                continue
            for m in chunk_matches:
                if m.id not in seen_ids:
                    seen_ids.add(m.id)
                    matches.append(m)
        print(f"  {len(matches)} match(s) trouvé(s) sur la saison.")

        # data/matches.json est réservé à la fenêtre glissante gérée par
        # fetch_all.py : ici on ne touche qu'aux détails de match, append-only,
        # sans jamais écraser le fichier résumé quotidien.
        written = fetch_match_details(provider, matches)
        print(f"  {written} nouveau(x) détail(s) de match écrit(s).")

        fetch_season_standings_and_topscorers(provider, competition, target["id"], args.season_name)

        history_entries.append(
            {
                "competition": asdict(competition),
                "matches": [asdict(m) for m in matches],
            }
        )

    if history_entries:
        history_path = DATA_DIR / "matches-history.json"
        # Fusionne avec un fichier historique existant (autre saison déjà
        # présente) plutôt que de l'écraser, même logique append que le reste.
        existing = {}
        if history_path.exists():
            try:
                existing = json.loads(history_path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                existing = {}
        merged = {e["competition"]["id"]: e for e in existing.get("competitions", [])}
        for entry in history_entries:
            key = entry["competition"]["id"]
            if key in merged:
                seen_ids = {m["id"] for m in merged[key]["matches"]}
                merged[key]["matches"].extend(m for m in entry["matches"] if m["id"] not in seen_ids)
            else:
                merged[key] = entry
        payload = {
            "generated_at": datetime.now(UTC).isoformat(),
            "note": "Backfill historique via fetch_season.py, distinct de la fenêtre glissante quotidienne.",
            "competitions": list(merged.values()),
        }
        history_path.write_text(
            json.dumps(payload, indent=2, ensure_ascii=False, default=_json_default),
            encoding="utf-8",
        )
        print(f"Écrit : {history_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
