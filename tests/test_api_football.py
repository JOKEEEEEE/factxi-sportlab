from datetime import UTC, date, datetime
import unittest

from sportlab.config import ConfigurationError, Settings
from sportlab.models import MatchStatus
from sportlab.providers.api_football import ApiFootballProvider

NOW = datetime(2026, 8, 4, 10, 30, tzinfo=UTC)


class ApiFootballProviderTests(unittest.TestCase):
    def test_competitions_are_normalised_with_trace(self) -> None:
        def fake_transport(url, headers, timeout):
            self.assertTrue(url.endswith("/leagues?country=France"))
            self.assertEqual(headers, {"x-apisports-key": "test-key"})
            return {"response": [{
                "league": {"id": 61, "name": "Ligue 1", "type": "League", "logo": "logo"},
                "country": {"name": "France"},
            }]}

        provider = ApiFootballProvider(
            Settings(api_football_key="test-key"), transport=fake_transport, clock=lambda: NOW
        )
        competition = provider.competitions(country="France")[0]
        self.assertEqual(competition.id, "api-football:league:61")
        self.assertEqual(competition.trace.endpoint, "/leagues")
        self.assertEqual(competition.trace.scope, {"country": "France"})
        self.assertEqual(competition.trace.collected_at, NOW)

    def test_matches_are_normalised_without_network(self) -> None:
        def fake_transport(url, headers, timeout):
            self.assertIn("league=61", url)
            self.assertIn("season=2025", url)
            return {"response": [{
                "fixture": {
                    "id": 123,
                    "date": "2026-05-10T19:00:00+00:00",
                    "status": {"short": "FT"},
                },
                "league": {"id": 61},
                "teams": {
                    "home": {"id": 1, "name": "Paris"},
                    "away": {"id": 2, "name": "Lyon"},
                },
                "goals": {"home": 2, "away": 1},
            }]}

        provider = ApiFootballProvider(
            Settings(api_football_key="test-key"), transport=fake_transport, clock=lambda: NOW
        )
        match = provider.matches(
            competition_id="api-football:league:61",
            season=2025,
            date_from=date(2026, 5, 10),
            date_to=date(2026, 5, 10),
        )[0]
        self.assertIs(match.status, MatchStatus.FINISHED)
        self.assertEqual((match.home_score, match.away_score), (2, 1))
        self.assertEqual(match.trace.provider_ids["fixture"], 123)
        self.assertEqual(match.trace.scope["from"], "2026-05-10")

    def test_no_key_means_transport_is_never_called(self) -> None:
        called = False

        def forbidden_transport(url, headers, timeout):
            nonlocal called
            called = True
            return {}

        provider = ApiFootballProvider(Settings(), transport=forbidden_transport)
        with self.assertRaises(ConfigurationError):
            provider.competitions()
        self.assertFalse(called)


if __name__ == "__main__":
    unittest.main()

