"""Tests for local host registry behavior."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from remote_agent_bridge.models import AuthConfig, HostProfile
from remote_agent_bridge.storage import HostRegistry


class HostRegistryTests(unittest.TestCase):
    """Verify basic registry persistence and replacement."""

    def test_save_and_load_round_trip(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            registry = HostRegistry(Path(temp_dir) / "hosts.json")
            profile = HostProfile(
                name="lab-win",
                hostname="192.168.1.50",
                username="admin",
                auth=AuthConfig(method="key", key_path="C:\\keys\\id_ed25519"),
            )

            registry.save_profile(profile)
            loaded = registry.get_profile("lab-win")

            self.assertIsNotNone(loaded)
            assert loaded is not None
            self.assertEqual(loaded.hostname, "192.168.1.50")
            self.assertEqual(loaded.auth.key_path, "C:\\keys\\id_ed25519")

    def test_save_replaces_existing_host_by_name(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            registry = HostRegistry(Path(temp_dir) / "hosts.json")
            registry.save_profile(
                HostProfile(name="lab-win", hostname="host-a", username="admin")
            )
            registry.save_profile(
                HostProfile(name="lab-win", hostname="host-b", username="admin")
            )

            profiles = registry.list_profiles()

            self.assertEqual(len(profiles), 1)
            self.assertEqual(profiles[0].hostname, "host-b")


if __name__ == "__main__":
    unittest.main()
