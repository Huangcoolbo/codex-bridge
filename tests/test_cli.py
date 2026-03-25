"""CLI behavior tests."""

from __future__ import annotations

import io
import json
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest.mock import patch

from remote_agent_bridge.cli import main
from remote_agent_bridge.models import AuthConfig, CommandResult, HostProfile, RemoteOperationResult
from remote_agent_bridge.storage import HostRegistry


class CLITests(unittest.TestCase):
    def test_exec_prints_structured_json_result(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            registry_path = Path(temp_dir) / "hosts.json"
            registry = HostRegistry(registry_path)
            registry.save_profile(
                HostProfile(
                    name="lab-win",
                    hostname="192.168.1.50",
                    username="admin",
                    auth=AuthConfig(method="key", key_path="C:\\keys\\id_ed25519"),
                )
            )
            result = RemoteOperationResult.from_command(
                "exec",
                CommandResult(exit_code=0, stdout="hello\n", stderr=""),
                target={"command": "Write-Output hello", "cwd": "C:\\Temp"},
                data={"command": "Write-Output hello", "cwd": "C:\\Temp"},
                host="lab-win",
            )

            with patch("remote_agent_bridge.cli.BridgeService.execute", return_value=result) as execute_mock:
                stdout = io.StringIO()
                with redirect_stdout(stdout):
                    exit_code = main(
                        [
                            "--registry-file",
                            str(registry_path),
                            "exec",
                            "--cwd",
                            "C:\\Temp",
                            "lab-win",
                            "--",
                            "Write-Output",
                            "hello",
                        ]
                    )

        payload = json.loads(stdout.getvalue())
        self.assertEqual(exit_code, 0)
        self.assertEqual(payload["operation"], "exec")
        self.assertEqual(payload["host"], "lab-win")
        self.assertEqual(payload["target"]["command"], "Write-Output hello")
        self.assertEqual(payload["target"]["cwd"], "C:\\Temp")
        self.assertEqual(payload["stdout"], "hello\n")
        execute_mock.assert_called_once_with("lab-win", "Write-Output hello", cwd="C:\\Temp", password_override=None)

    def test_exec_reads_command_from_local_script_file(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            registry_path = Path(temp_dir) / "hosts.json"
            script_path = Path(temp_dir) / "remote.ps1"
            script_path.write_text("Write-Output 'hello'\nGet-ChildItem\n", encoding="utf-8")
            registry = HostRegistry(registry_path)
            registry.save_profile(
                HostProfile(
                    name="lab-win",
                    hostname="192.168.1.50",
                    username="admin",
                    auth=AuthConfig(method="key", key_path="C:\\keys\\id_ed25519"),
                )
            )
            result = RemoteOperationResult.from_command(
                "exec",
                CommandResult(exit_code=0, stdout="hello\n", stderr=""),
                target={"command": script_path.read_text(encoding="utf-8"), "cwd": "C:\\Ops"},
                data={"command": script_path.read_text(encoding="utf-8"), "cwd": "C:\\Ops"},
                host="lab-win",
            )

            with patch("remote_agent_bridge.cli.BridgeService.execute", return_value=result) as execute_mock:
                stdout = io.StringIO()
                with redirect_stdout(stdout):
                    exit_code = main(
                        [
                            "--registry-file",
                            str(registry_path),
                            "exec",
                            "--cwd",
                            "C:\\Ops",
                            "--command-file",
                            str(script_path),
                            "lab-win",
                        ]
                    )

        payload = json.loads(stdout.getvalue())
        self.assertEqual(exit_code, 0)
        self.assertEqual(payload["operation"], "exec")
        self.assertEqual(payload["target"]["cwd"], "C:\\Ops")
        execute_mock.assert_called_once_with(
            "lab-win",
            "Write-Output 'hello'\nGet-ChildItem\n",
            cwd="C:\\Ops",
            password_override=None,
        )

    def test_exec_rejects_missing_command_file_with_clear_error(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            registry_path = Path(temp_dir) / "hosts.json"
            registry = HostRegistry(registry_path)
            registry.save_profile(
                HostProfile(
                    name="lab-win",
                    hostname="192.168.1.50",
                    username="admin",
                    auth=AuthConfig(method="key", key_path="C:\\keys\\id_ed25519"),
                )
            )

            stdout = io.StringIO()
            stderr = io.StringIO()
            with redirect_stdout(stdout), redirect_stderr(stderr):
                exit_code = main(
                    [
                        "--registry-file",
                        str(registry_path),
                        "exec",
                        "--command-file",
                        str(Path(temp_dir) / "missing.ps1"),
                        "lab-win",
                    ]
                )

        self.assertEqual(exit_code, 1)
        self.assertIn("Local command file not found", stderr.getvalue())

    def test_search_text_prints_structured_json_result(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            registry_path = Path(temp_dir) / "hosts.json"
            registry = HostRegistry(registry_path)
            registry.save_profile(
                HostProfile(
                    name="lab-win",
                    hostname="192.168.1.50",
                    username="admin",
                    auth=AuthConfig(method="key", key_path="C:\\keys\\id_ed25519"),
                )
            )
            result = RemoteOperationResult.from_command(
                "search-text",
                CommandResult(exit_code=0, stdout="{}", stderr=""),
                target={"path": "C:\\Logs", "pattern": "needle", "encoding": "utf-8", "recurse": True},
                data={
                    "path": "C:\\Logs",
                    "pattern": "needle",
                    "encoding": "utf-8",
                    "recurse": True,
                    "match_count": 1,
                    "matches": [{"path": "C:\\Logs\\app.log", "line_number": 3, "line": "needle here"}],
                },
                host="lab-win",
            )

            with patch("remote_agent_bridge.cli.BridgeService.search_text", return_value=result) as search_mock:
                stdout = io.StringIO()
                with redirect_stdout(stdout):
                    exit_code = main(
                        [
                            "--registry-file",
                            str(registry_path),
                            "search-text",
                            "lab-win",
                            "C:\\Logs",
                            "needle",
                            "--recurse",
                        ]
                    )

        payload = json.loads(stdout.getvalue())
        self.assertEqual(exit_code, 0)
        self.assertEqual(payload["operation"], "search-text")
        self.assertEqual(payload["target"]["path"], "C:\\Logs")
        self.assertEqual(payload["target"]["pattern"], "needle")
        self.assertTrue(payload["target"]["recurse"])
        search_mock.assert_called_once_with(
            "lab-win",
            "C:\\Logs",
            "needle",
            encoding="utf-8",
            recurse=True,
            password_override=None,
        )


if __name__ == "__main__":
    unittest.main()
