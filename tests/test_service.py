"""Tests for bridge service result handling."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from remote_agent_bridge.models import AuthConfig, CommandResult, HostProfile, RemoteOperationResult
from remote_agent_bridge.service import BridgeService
from remote_agent_bridge.storage import HostRegistry


class FakeProvider:
    def __init__(self) -> None:
        self.closed = False

    def probe(self) -> RemoteOperationResult:
        return RemoteOperationResult.from_command(
            "probe",
            CommandResult(exit_code=0, stdout="{}", stderr=""),
            data={"computer_name": "LAB"},
        )

    def execute(
        self,
        command: str,
        cwd: str | None = None,
        timeout_seconds: int | None = None,
    ) -> RemoteOperationResult:
        return RemoteOperationResult.from_command(
            "exec",
            CommandResult(exit_code=0, stdout="done", stderr=""),
            target={"command": command, "cwd": cwd, "timeout_seconds": timeout_seconds},
            data={"command": command, "cwd": cwd, "timeout_seconds": timeout_seconds},
        )

    def read_file(self, path: str, encoding: str = "utf-8") -> RemoteOperationResult:
        return RemoteOperationResult.from_command(
            "read-file",
            CommandResult(exit_code=0, stdout='{"content_base64":"Y29udGVudA=="}', stderr=""),
            target={"path": path, "encoding": encoding},
            data={
                "path": path,
                "content": "content",
                "encoding": encoding,
                "size": 7,
                "last_write_time": None,
            },
        )

    def list_dir(self, path: str) -> RemoteOperationResult:
        return RemoteOperationResult.from_command(
            "list-dir",
            CommandResult(exit_code=0, stdout="[]", stderr=""),
            target={"path": path},
            data=[],
        )

    def write_file(self, path: str, content: str, encoding: str = "utf-8") -> RemoteOperationResult:
        return RemoteOperationResult.from_command(
            "write-file",
            CommandResult(exit_code=0, stdout="", stderr=""),
            target={"path": path, "encoding": encoding},
            data={"path": path, "encoding": encoding, "bytes_written": len(content.encode(encoding))},
        )

    def search_text(
        self,
        path: str,
        pattern: str,
        *,
        encoding: str = "utf-8",
        recurse: bool = False,
    ) -> RemoteOperationResult:
        return RemoteOperationResult.from_command(
            "search-text",
            CommandResult(exit_code=0, stdout="{}", stderr=""),
            target={"path": path, "pattern": pattern, "encoding": encoding, "recurse": recurse},
            data={
                "path": path,
                "pattern": pattern,
                "encoding": encoding,
                "recurse": recurse,
                "match_count": 1,
                "matches": [{"path": path, "line_number": 3, "line": "needle here"}],
            },
        )

    def close(self) -> None:
        self.closed = True


class FakeFactory:
    def __init__(self, provider: FakeProvider) -> None:
        self.provider = provider

    def create(self, profile: HostProfile, password_override: str | None = None) -> FakeProvider:
        return self.provider


class BridgeServiceTests(unittest.TestCase):
    def test_execute_tags_result_with_host(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            registry = HostRegistry(Path(temp_dir) / "hosts.json")
            registry.save_profile(
                HostProfile(
                    name="lab-win",
                    hostname="192.168.1.50",
                    username="admin",
                    auth=AuthConfig(method="key", key_path="C:\\keys\\id_ed25519"),
                )
            )
            provider = FakeProvider()
            service = BridgeService(registry, factory=FakeFactory(provider))

            result = service.execute("lab-win", "Get-Date", cwd="C:\\Temp", timeout_seconds=20)

            self.assertEqual(result.host, "lab-win")
            self.assertEqual(result.operation, "exec")
            self.assertEqual(result.target["command"], "Get-Date")
            self.assertEqual(result.target["cwd"], "C:\\Temp")
            self.assertEqual(result.target["timeout_seconds"], 20)
            self.assertTrue(provider.closed)

    def test_search_text_tags_result_with_host(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            registry = HostRegistry(Path(temp_dir) / "hosts.json")
            registry.save_profile(
                HostProfile(
                    name="lab-win",
                    hostname="192.168.1.50",
                    username="admin",
                    auth=AuthConfig(method="key", key_path="C:\\keys\\id_ed25519"),
                )
            )
            provider = FakeProvider()
            service = BridgeService(registry, factory=FakeFactory(provider))

            result = service.search_text(
                "lab-win",
                "C:\\Temp",
                "needle",
                encoding="utf-8",
                recurse=True,
            )

            self.assertEqual(result.host, "lab-win")
            self.assertEqual(result.operation, "search-text")
            self.assertEqual(result.target["path"], "C:\\Temp")
            self.assertEqual(result.target["pattern"], "needle")
            self.assertTrue(result.target["recurse"])
            self.assertTrue(provider.closed)


if __name__ == "__main__":
    unittest.main()
