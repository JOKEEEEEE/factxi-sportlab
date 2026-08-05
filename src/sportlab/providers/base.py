"""Contrat que tout fournisseur de données football doit respecter."""

from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import date
from typing import Sequence

from sportlab.models import Competition, Match


class FootballDataProvider(ABC):
    name: str

    @abstractmethod
    def competitions(self, *, country: str | None = None) -> Sequence[Competition]:
        """Retourne les compétitions disponibles, éventuellement filtrées par pays."""

    @abstractmethod
    def matches(
        self,
        *,
        competition_id: str,
        season: int,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> Sequence[Match]:
        """Retourne les matchs pour un périmètre explicite."""

