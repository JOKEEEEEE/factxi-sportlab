from datetime import UTC, date, datetime
import unittest

from sportlab.config import ConfigurationError, Settings
from sportlab.models import MatchStatus
from sportlab.providers.sportmonks import SportMonksProvider

NOW = datetime(2026, 8, 5, 10, 0, tzinfo=UTC)


class SportMonksProviderTests(unittest.TestCase):
    def test_competitions_are_normalised_with_trace(self) -> None:
        def fake_transport(url, headers, timeout):
            self.assertTrue(url.endswith("/leagues?include=country"))
            self.assertEqual(headers, {"Authorization": "test-token"})
            return {
                "data": [
                    {
                        "id": 8,
                        "name": "Premier League",
                        "sub_type": "domestic",
                        "image_path": "logo.png",
                        "country": {"name": "England"},
                    }
                ]
            }

        provider = SportMonksProvider(
            Settings(sportmonks_api_token="test-token"),
            transport=fake_transport,
            clock=lambda: NOW,
        )
        competition = provider.competitions()[0]
        self.assertEqual(competition.id, "sportmonks:league:8")
        self.assertEqual(competition.country, "England")
        self.assertEqual(competition.trace.provider, "sportmonks")
        self.assertEqual(competition.trace.collected_at, NOW)

    def test_competitions_filters_by_country_client_side(self) -> None:
        def fake_transport(url, headers, timeout):
            return {
                "data": [
                    {"id": 8, "name": "Premier League", "country": {"name": "England"}},
                    {"id": 501, "name": "Ligue 1", "country": {"name": "France"}},
                ]
            }

        provider = SportMonksProvider(
            Settings(sportmonks_api_token="test-token"), transport=fake_transport, clock=lambda: NOW
        )
        competitions = provider.competitions(country="France")
        self.assertEqual(len(competitions), 1)
        self.assertEqual(competitions[0].name, "Ligue 1")

    def test_matches_requires_explicit_date_range(self) -> None:
        provider = SportMonksProvider(
            Settings(sportmonks_api_token="test-token"), transport=lambda *a: {}, clock=lambda: NOW
        )
        with self.assertRaises(Exception):
            provider.matches(competition_id="sportmonks:league:8", season=2024)

    def test_matches_are_normalised_without_network(self) -> None:
        def fake_transport(url, headers, timeout):
            self.assertIn("/fixtures/between/2025-02-01/2025-02-03", url)
            self.assertIn("fixtureLeagues%3A8", url)
            return {
                "data": [
                    {
                        "id": 123,
                        "starting_at": "2025-02-02 16:30:00",
                        "state": {"short_name": "FT"},
                        "participants": [
                            {"id": 1, "name": "Arsenal", "meta": {"location": "home"}},
                            {"id": 2, "name": "Manchester City", "meta": {"location": "away"}},
                        ],
                        "scores": [
                            {
                                "description": "CURRENT",
                                "score": {"goals": 5, "participant": "home"},
                            },
                            {
                                "description": "CURRENT",
                                "score": {"goals": 1, "participant": "away"},
                            },
                        ],
                    }
                ]
            }

        provider = SportMonksProvider(
            Settings(sportmonks_api_token="test-token"), transport=fake_transport, clock=lambda: NOW
        )
        match = provider.matches(
            competition_id="sportmonks:league:8",
            season=2024,
            date_from=date(2025, 2, 1),
            date_to=date(2025, 2, 3),
        )[0]
        self.assertIs(match.status, MatchStatus.FINISHED)
        self.assertEqual((match.home_score, match.away_score), (5, 1))
        self.assertEqual(match.season, 2024)
        self.assertEqual(match.trace.provider_ids["fixture"], 123)

    def test_no_token_means_transport_is_never_called(self) -> None:
        called = False

        def forbidden_transport(url, headers, timeout):
            nonlocal called
            called = True
            return {}

        provider = SportMonksProvider(Settings(), transport=forbidden_transport)
        with self.assertRaises(ConfigurationError):
            provider.competitions()
        self.assertFalse(called)


if __name__ == "__main__":
    unittest.main()
