"""Adaptateur SportMonks Football API v3.

Important : ce module a été écrit sans accès réseau et n'a donc pas pu être
validé contre une vraie réponse de l'API. Les noms de champs (starting_at,
state.short_name, scores...) et les valeurs de statut correspondent à la
documentation publique de SportMonks au moment de l'écriture, mais doivent
être vérifiés lors du premier appel réel et ajustés si besoin. Ce n'est pas
un défaut caché : c'est la même règle que pour api_football.py, appliquée
avant tout appel réel.
"""

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
    # Certaines API derrière un pare-feu (Cloudflare, etc.) bloquent le
    # User-Agent par défaut d'urllib ("Python-urllib/3.x") alors qu'elles
    # laissent passer curl. On imite un client explicite pour éviter un
    # 403 qui n'a rien à voir avec le jeton.
    full_headers = {
        "User-Agent": "SportLab/0.1 (+FACT XI; contact via projet)",
        "Accept": "application/json",
        **headers,
    }
    request = Request(url, headers=full_headers, method="GET")
    try:
        with urlopen(request, timeout=timeout) as response:  # noqa: S310 (URL configurée)
            payload = json.load(response)
    except HTTPError as exc:
        body = ""
        try:
            body = exc.read().decode("utf-8", errors="replace")[:500]
        except Exception:
            pass
        raise ProviderError(f"SportMonks a répondu HTTP {exc.code}: {body}") from exc
    except URLError as exc:
        raise ProviderError(f"SportMonks est inaccessible: {exc.reason}") from exc
    if not isinstance(payload, dict):
        raise ProviderError("Réponse SportMonks inattendue")
    return payload


class SportMonksProvider(FootballDataProvider):
    name = "sportmonks"

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

    def _get(
        self, endpoint: str, params: Mapping[str, str]
    ) -> tuple[list[JsonObject], datetime]:
        token = self._settings.require_sportmonks_api_token()
        query = urlencode(params)
        url = f"{self._settings.sportmonks_base_url}/{endpoint}"
        if query:
            url = f"{url}?{query}"
        collected_at = self._clock()
        # Authentification par en-tête plutôt que par paramètre d'URL,
        # pour ne jamais faire transiter le jeton dans une URL journalisable.
        payload = self._transport(url, {"Authorization": token}, self._settings.timeout_seconds)
        if "data" not in payload:
            message = payload.get("message", "réponse sans champ 'data'")
            raise ProviderError(f"Erreur SportMonks: {message}")
        data = payload["data"]
        rows = data if isinstance(data, list) else [data]
        return rows, collected_at

    def competitions(self, *, country: str | None = None) -> list[Competition]:
        # Le endpoint /leagues ne prend pas de filtre pays simple et documenté :
        # on récupère la liste (limitée à ce que couvre l'abonnement) et on
        # filtre côté client si un pays est demandé.
        rows, collected_at = self._get("leagues", {"include": "country"})
        result: list[Competition] = []
        for row in rows:
            league_id = row.get("id")
            if league_id is None:
                raise ProviderError("Compétition sans identifiant fournisseur")
            country_name = (row.get("country") or {}).get("name")
            if country and (country_name or "").lower() != country.lower():
                continue
            result.append(
                Competition(
                    id=f"sportmonks:league:{league_id}",
                    name=str(row.get("name", "")),
                    country=country_name,
                    competition_type=row.get("sub_type") or row.get("type"),
                    logo_url=row.get("image_path"),
                    current_season_id=self._current_season_id(league_id),
                    trace=SourceTrace(
                        provider=self.name,
                        endpoint="/leagues",
                        collected_at=collected_at,
                        scope={"country": country} if country else {},
                        provider_ids={"league": league_id},
                    ),
                )
            )
        return result

    def _current_season_id(self, league_id: int) -> int | None:
        """Récupère l'id de saison en cours pour une ligue.

        Le endpoint /leagues (liste complète) ignore silencieusement l'include
        imbriqué currentSeason ; on doit interroger chaque ligue individuellement
        (/leagues/{id}?include=currentSeason). Confirmé par un vrai appel : la
        clé de la réponse est en minuscules ("currentseason"), pas en camelCase
        comme le paramètre d'include lui-même ni comme le laisse penser la doc.
        """
        try:
            rows, _ = self._get(f"leagues/{league_id}", {"include": "currentSeason"})
        except ProviderError as exc:
            print(f"    [diagnostic] échec récupération saison pour la ligue {league_id}: {exc}")
            return None
        if not rows:
            print(f"    [diagnostic] réponse vide pour la ligue {league_id}")
            return None
        current_season = rows[0].get("currentseason") or rows[0].get("currentSeason") or {}
        if not current_season.get("id"):
            print(f"    [diagnostic] ligue {league_id}: réponse reçue mais sans currentseason exploitable. Clés présentes : {list(rows[0].keys())}")
        return current_season.get("id")

    def get_raw_standings(self, season_id: int, *, include: str = "participant;details.type;rule") -> list[JsonObject]:
        """Classement complet d'une saison, réponse brute (non normalisée).

        L'include "rule" ramène la vraie règle de zone (qualification Ligue
        des Champions, Europa, relégation...) fournie par SportMonks pour
        cette compétition et cette saison précises — pas une règle qu'on
        devine ou code en dur nous-mêmes.
        """
        rows, _ = self._get(f"standings/seasons/{season_id}", {"include": include})
        return rows

    def get_raw_topscorers(
        self, season_id: int, *, include: str = "player;participant;type"
    ) -> list[JsonObject]:
        """Meilleurs buteurs/passeurs/cartons d'une saison, réponse brute (non normalisée)."""
        rows, _ = self._get(f"topscorers/seasons/{season_id}", {"include": include})
        return rows

    def get_raw_seasons(self, league_id: int) -> list[JsonObject]:
        """Liste toutes les saisons connues d'une ligue (id, nom, année), réponse brute.

        Prépare la sélection de saison/journée dans l'interface. Nécessite
        l'accès aux données historiques SportMonks pour être vraiment utile
        au-delà de la saison en cours. Pas encore branché nulle part : à
        utiliser une fois qu'on a confirmé la forme réelle de la réponse.
        """
        rows, _ = self._get(f"leagues/{league_id}", {"include": "seasons"})
        if not rows:
            return []
        return rows[0].get("seasons") or []

    def get_raw_fixture(self, fixture_id: str, *, include: str) -> JsonObject:
        """Retourne la réponse brute (non normalisée) d'un match précis.

        Utile pour des besoins ponctuels et riches (compositions, événements,
        statistiques, xG) qui dépassent le modèle normalisé minimal de
        `Match`. Contrairement à `matches()`, ceci ne transforme rien : on
        obtient exactement ce que l'API renvoie.
        """
        rows, _ = self._get(f"fixtures/{fixture_id}", {"include": include})
        if not rows:
            raise ProviderError(f"Aucune donnée pour le match {fixture_id}")
        return rows[0]

    def matches(
        self,
        *,
        competition_id: str,
        season: int,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> list[Match]:
        if date_from is None or date_to is None:
            raise ProviderError(
                "SportMonks nécessite date_from et date_to explicites : "
                "l'endpoint /fixtures/between ne fonctionne pas sans plage de dates."
            )
        league_id = _provider_id(competition_id, "league")
        endpoint = f"fixtures/between/{date_from.isoformat()}/{date_to.isoformat()}"
        params = {
            "filters": f"fixtureLeagues:{league_id}",
            "include": "participants;scores;state;round",
        }
        rows, collected_at = self._get(endpoint, params)
        return [
            self._normalise_match(row, params, collected_at, season, league_id) for row in rows
        ]

    def _normalise_match(
        self,
        row: JsonObject,
        scope: Mapping[str, str],
        collected_at: datetime,
        season: int,
        league_id: str,
    ) -> Match:
        fixture_id = row.get("id")
        participants = row.get("participants") or []
        home = next(
            (p for p in participants if (p.get("meta") or {}).get("location") == "home"), None
        )
        away = next(
            (p for p in participants if (p.get("meta") or {}).get("location") == "away"), None
        )
        if fixture_id is None or home is None or away is None:
            raise ProviderError("Match incomplet: participants manquants")
        scores = row.get("scores") or []
        return Match(
            id=f"sportmonks:fixture:{fixture_id}",
            kickoff=_parse_datetime(row.get("starting_at")),
            status=_normalise_status((row.get("state") or {}).get("short_name")),
            competition_id=f"sportmonks:league:{league_id}",
            season=season,
            home=TeamRef(
                f"sportmonks:team:{home['id']}",
                str(home.get("name", "")),
                home.get("image_path"),
            ),
            away=TeamRef(
                f"sportmonks:team:{away['id']}",
                str(away.get("name", "")),
                away.get("image_path"),
            ),
            home_score=_extract_score(scores, "home"),
            away_score=_extract_score(scores, "away"),
            round=((row.get("round") or {}).get("name")),
            trace=SourceTrace(
                provider=self.name,
                endpoint="/fixtures/between",
                collected_at=collected_at,
                scope=dict(scope),
                provider_ids={
                    "fixture": fixture_id,
                    "league": league_id,
                    "home_team": home["id"],
                    "away_team": away["id"],
                },
            ),
        )


def _extract_score(scores: Any, location: str) -> int | None:
    """Cherche le score courant pour 'home' ou 'away' dans le tableau `scores`.

    Le format exact de cette structure doit être confirmé au premier appel réel.
    """
    for entry in scores or []:
        participant = (entry.get("score") or {}).get("participant")
        if entry.get("description") == "CURRENT" and participant == location:
            return (entry.get("score") or {}).get("goals")
    return None


def _provider_id(value: str, entity: str) -> str:
    prefix = f"sportmonks:{entity}:"
    if not value.startswith(prefix) or not value.removeprefix(prefix).isdigit():
        raise ValueError(f"Identifiant attendu au format {prefix}<nombre>")
    return value.removeprefix(prefix)


def _parse_datetime(value: Any) -> datetime:
    if not isinstance(value, str):
        raise ProviderError("Date de match absente ou invalide")
    normalised = value.replace(" ", "T")
    if not normalised.endswith("Z") and "+" not in normalised[10:]:
        normalised += "+00:00"
    try:
        parsed = datetime.fromisoformat(normalised.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ProviderError(f"Date de match invalide: {value}") from exc
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def _normalise_status(status: Any) -> MatchStatus:
    if status in {"NS", "TBA"}:
        return MatchStatus.SCHEDULED
    if status in {"1H", "2H", "HT", "ET", "BREAK", "PEN_LIVE", "LIVE"}:
        return MatchStatus.LIVE
    if status in {"FT", "AET", "FT_PEN"}:
        return MatchStatus.FINISHED
    if status == "POSTP":
        return MatchStatus.POSTPONED
    if status in {"CANCL", "ABAN", "WO"}:
        return MatchStatus.CANCELLED
    return MatchStatus.UNKNOWN
