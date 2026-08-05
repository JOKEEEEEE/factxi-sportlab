"""Modèle normalisé minimal, indépendant du fournisseur."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from typing import Any, Mapping


class MatchStatus(StrEnum):
    SCHEDULED = "scheduled"
    LIVE = "live"
    FINISHED = "finished"
    POSTPONED = "postponed"
    CANCELLED = "cancelled"
    UNKNOWN = "unknown"


@dataclass(frozen=True, slots=True)
class SourceTrace:
    provider: str
    endpoint: str
    collected_at: datetime
    scope: Mapping[str, Any]
    calculation: str | None = None
    provider_ids: Mapping[str, int | str] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class Competition:
    id: str
    name: str
    country: str | None
    competition_type: str | None
    logo_url: str | None
    trace: SourceTrace


@dataclass(frozen=True, slots=True)
class TeamRef:
    id: str
    name: str


@dataclass(frozen=True, slots=True)
class Match:
    id: str
    kickoff: datetime
    status: MatchStatus
    competition_id: str
    season: int
    home: TeamRef
    away: TeamRef
    home_score: int | None
    away_score: int | None
    trace: SourceTrace

