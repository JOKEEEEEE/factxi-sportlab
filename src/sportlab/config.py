"""Configuration de SportLab, sans lecture implicite de fichiers secrets."""

from __future__ import annotations

from dataclasses import dataclass
import os


class ConfigurationError(ValueError):
    """Configuration absente ou invalide."""


@dataclass(frozen=True, slots=True)
class Settings:
    api_football_key: str | None = None
    api_football_base_url: str = "https://v3.football.api-sports.io"
    sportmonks_api_token: str | None = None
    sportmonks_base_url: str = "https://api.sportmonks.com/v3/football"
    timeout_seconds: float = 15.0

    @classmethod
    def from_env(cls) -> "Settings":
        timeout = os.getenv("SPORTLAB_TIMEOUT_SECONDS", "15")
        try:
            timeout_seconds = float(timeout)
        except ValueError as exc:
            raise ConfigurationError("SPORTLAB_TIMEOUT_SECONDS doit être un nombre") from exc
        if timeout_seconds <= 0:
            raise ConfigurationError("SPORTLAB_TIMEOUT_SECONDS doit être positif")
        return cls(
            api_football_key=os.getenv("API_FOOTBALL_KEY") or None,
            api_football_base_url=os.getenv(
                "API_FOOTBALL_BASE_URL", "https://v3.football.api-sports.io"
            ).rstrip("/"),
            sportmonks_api_token=os.getenv("SPORTMONKS_API_TOKEN") or None,
            sportmonks_base_url=os.getenv(
                "SPORTMONKS_BASE_URL", "https://api.sportmonks.com/v3/football"
            ).rstrip("/"),
            timeout_seconds=timeout_seconds,
        )

    def require_api_football_key(self) -> str:
        if not self.api_football_key:
            raise ConfigurationError(
                "API_FOOTBALL_KEY est absente. Aucune requête API-Football n'a été envoyée."
            )
        return self.api_football_key

    def require_sportmonks_api_token(self) -> str:
        if not self.sportmonks_api_token:
            raise ConfigurationError(
                "SPORTMONKS_API_TOKEN est absent. Aucune requête SportMonks n'a été envoyée."
            )
        return self.sportmonks_api_token
