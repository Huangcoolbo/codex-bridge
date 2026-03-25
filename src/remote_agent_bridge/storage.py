"""Local JSON-backed storage for host profiles."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional

from remote_agent_bridge.models import HostProfile


class HostRegistry:
    """Persist and load host profiles from a project-local JSON file."""

    def __init__(self, path: Path) -> None:
        self.path = path

    def ensure_exists(self) -> None:
        """Create the registry file with an empty structure if needed."""
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if not self.path.exists():
            self._write_payload({"hosts": []})

    def list_profiles(self) -> List[HostProfile]:
        """Return all profiles sorted by host name."""
        payload = self._read_payload()
        profiles = [HostProfile.from_dict(item) for item in payload.get("hosts", [])]
        return sorted(profiles, key=lambda item: item.name.lower())

    def get_profile(self, name: str) -> Optional[HostProfile]:
        """Return a single profile if present."""
        return next((profile for profile in self.list_profiles() if profile.name == name), None)

    def save_profile(self, profile: HostProfile) -> None:
        """Insert or replace a host profile by name."""
        payload = self._read_payload()
        hosts = [item for item in payload.get("hosts", []) if item.get("name") != profile.name]
        hosts.append(profile.to_dict())
        hosts.sort(key=lambda item: str(item["name"]).lower())
        self._write_payload({"hosts": hosts})

    def _read_payload(self) -> Dict[str, Any]:
        self.ensure_exists()
        with self.path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
        if not isinstance(data, dict):
            raise ValueError("Invalid registry format in {0}".format(self.path))
        return data

    def _write_payload(self, payload: Dict[str, Any]) -> None:
        with self.path.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2)
            handle.write("\n")
