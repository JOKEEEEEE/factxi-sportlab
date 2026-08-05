import os
import unittest
from unittest.mock import patch

from sportlab.config import ConfigurationError, Settings


class SettingsTests(unittest.TestCase):
    def test_missing_key_fails_before_any_request(self) -> None:
        with self.assertRaisesRegex(ConfigurationError, "Aucune requête"):
            Settings().require_api_football_key()

    def test_settings_are_loaded_from_environment(self) -> None:
        environment = {"API_FOOTBALL_KEY": "secret", "SPORTLAB_TIMEOUT_SECONDS": "3.5"}
        with patch.dict(os.environ, environment, clear=True):
            settings = Settings.from_env()
        self.assertEqual(settings.api_football_key, "secret")
        self.assertEqual(settings.timeout_seconds, 3.5)


if __name__ == "__main__":
    unittest.main()

