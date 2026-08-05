"""Adaptateur API-Football v3."""

from __future__ import annotations

from collections.abc import Callable, Mapping
from datetime import UTC, date, datetime
import json
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from sportlab.config import Settings
from sportlab.models import Competition, Match, MatchStatus, SourceTrace, TeamRef
from sportlab.providers.base import FootballDataProvider

JsonObject = Mapping[str, Any]
Transport = Callable[[str, Mapping[str, str], float], JsonObject]


class ProviderError(RuntimeError):
    """Erreur explicite du fournisseur ou de son transport."""


def _http_get(url: str, headers: Mapping[str, str], timeout: float) -> JsonObject:
    request = Request(url, headers=dict(headers), method="GET")
    try:
        with urlopen(request, timeout=timeout) as response:  # noqa: S310 (URL configurée)
            payload = json.load(response)
    except HTTPError as exc:
        raise ProviderError(f"API-Football a répondu HTTP {exc.code}") from exc
    except URLError as exc:
        raise ProviderError(f"API-Football est inaccessible: {exc.reason}") from exc
    if not isinstance(payload, dict):
        raise ProviderError("Réponse API-Football inattendue")
    return payload


class ApiFootballProvider(FootballDataProvider):
    name = "api-football"

    def __init__(
        self,
        settings: Settings,
        *,
        transport: Transport = _http_get,
        clock: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._settings = settings
        self._transport = transport
        self._clock = clock

    def _get(self, endpoint: str, params: Mapping[str, str]) -> tuple[list[JsonObject], datetime]:
        key = self._settings.require_api_football_key()
        query = urlencode(params)
        url = f"{self._settings.api_football_base_url}/{endpoint}"
        if query:
            url = f"{url}?{query}"
        collected_at = self._clock()
        payload = self._transport(
            url, {"x-apisports-key": key}, self._settings.timeout_seconds
        )
        errors = payload.get("errors")
        if errors:
            raise ProviderError(f"Erreur API-Football: {errors}")
        response = payload.get("response")
        if not isinstance(response, list):
            raise ProviderError("Champ 'response' absent ou invalide")
        return response, collected_at

    def competitions(self, *, country: str | None = None) -> list[Competition]:
        params = {"country": country} if country else {}
        rows, collected_at = self._get("leagues", params)
        result: list[Competition] = []
        for row in rows:
            league = row.get("league", {})
            league_id = league.get("id")
            if league_id is None:
                raise ProviderError("Compétition sans identifiant fournisseur")
            result.append(
                Competition(
                    id=f"api-football:league:{league_id}",
                    name=str(league.get("name", "")),
                    country=(row.get("country") or {}).get("name"),
                    competition_type=league.get("type"),
                    logo_url=league.get("logo"),
                    trace=SourceTrace(
                        provider=self.name,
                        endpoint="/leagues",
                        collected_at=collected_at,
                        scope=dict(params),
                        provider_ids={"league": league_id},
                    ),
                )
            )
        return result

    def matches(
        self,
        *,
        competition_id: str,
        season: int,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> list[Match]:
        league_id = _provider_id(competition_id, "league")
        params = {"league": league_id, "season": str(season)}
        if date_from:
            params["from"] = date_from.isoformat()
        if date_to:
            params["to"] = date_to.isoformat()
        rows, collected_at = self._get("fixtures", params)
        return [self._normalise_match(row, params, collected_at, season) for row in rows]

    def _normalise_match(
        self, row: JsonObject, scope: Mapping[str, str], collected_at: datetime, season: int
    ) -> Match:
        fixture = row.get("fixture", {})
        teams = row.get("teams", {})
        goals = row.get("goals", {})
        league = row.get("league", {})
        fixture_id = fixture.get("id")
        home = teams.get("home", {})
        away = teams.get("away", {})
        if fixture_id is None or home.get("id") is None or away.get("id") is None:
            raise ProviderError("Match incomplet: identifiant manquant")
        return Match(
            id=f"api-football:fixture:{fixture_id}",
            kickoff=_parse_datetime(fixture.get("date")),
            status=_normalise_status((fixture.get("status") or {}).get("short")),
            competition_id=f"api-football:league:{league.get('id', scope['league'])}",
            season=season,
            home=TeamRef(f"api-football:team:{home['id']}", str(home.get("name", ""))),
            away=TeamRef(f"api-football:team:{away['id']}", str(away.get("name", ""))),
            home_score=goals.get("home"),
            away_score=goals.get("away"),
            trace=SourceTrace(
                provider=self.name,
                endpoint="/fixtures",
                collected_at=collected_at,
                scope=dict(scope),
                provider_ids={
                    "fixture": fixture_id,
                    "league": league.get("id", scope["league"]),
                    "home_team": home["id"],
                    "away_team": away["id"],
                },
            ),
        )


def _provider_id(value: str, entity: str) -> str:
    prefix = f"api-football:{entity}:"
    if not value.startswith(prefix) or not value.removeprefix(prefix).isdigit():
        raise ValueError(f"Identifiant attendu au format {prefix}<nombre>")
    return value.removeprefix(prefix)


def _parse_datetime(value: Any) -> datetime:
    if not isinstance(value, str):
        raise ProviderError("Date de match absente ou invalide")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ProviderError(f"Date de match invalide: {value}") from exc
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def _normalise_status(status: Any) -> MatchStatus:
    if status in {"TBD", "NS"}:
        return MatchStatus.SCHEDULED
    if status in {"1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT", "LIVE"}:
        return MatchStatus.LIVE
    if status in {"FT", "AET", "PEN"}:
        return MatchStatus.FINISHED
    if status == "PST":
        return MatchStatus.POSTPONED
    if status in {"CANC", "ABD", "AWD", "WO"}:
        return MatchStatus.CANCELLED
    return MatchStatus.UNKNOWN

