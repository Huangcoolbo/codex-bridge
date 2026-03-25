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
        execute_mock.assert_called_once_with(
            "lab-win",
            "Write-Output hello",
            cwd="C:\\Temp",
            timeout_seconds=None,
            password_override=None,
        )

    def test_exec_passes_timeout_seconds_through_to_service(self) -> None:
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
                CommandResult(exit_code=0, stdout="done\n", stderr=""),
                target={"command": "Get-Date", "cwd": None, "timeout_seconds": 15},
                data={"command": "Get-Date", "cwd": None, "timeout_seconds": 15},
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
                            "--timeout-seconds",
                            "15",
                            "lab-win",
                            "--",
                            "Get-Date",
                        ]
                    )

        payload = json.loads(stdout.getvalue())
        self.assertEqual(exit_code, 0)
        self.assertEqual(payload["target"]["timeout_seconds"], 15)
        execute_mock.assert_called_once_with(
            "lab-win",
            "Get-Date",
            cwd=None,
            timeout_seconds=15,
            password_override=None,
        )

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
            timeout_seconds=None,
            password_override=None,
        )

    def test_exec_rejects_non_positive_timeout_seconds(self) -> None:
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
                        "--timeout-seconds",
                        "0",
                        "lab-win",
                        "--",
                        "Get-Date",
                    ]
                )

        self.assertEqual(exit_code, 1)
        self.assertIn("--timeout-seconds must be a positive integer.", stderr.getvalue())

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

    def test_system_info_prints_structured_json_result(self) -> None:
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
                "system-info",
                CommandResult(exit_code=0, stdout="{}", stderr=""),
                data={
                    "computer_name": "LAB-WIN",
                    "os_caption": "Microsoft Windows 11 Pro",
                    "drives": [{"name": "C:", "free_bytes": 10, "size_bytes": 20}],
                    "ipv4_addresses": [{"interface_alias": "Ethernet", "ip_address": "192.168.1.10"}],
                },
                host="lab-win",
            )

            with patch("remote_agent_bridge.cli.BridgeService.system_info", return_value=result) as info_mock:
                stdout = io.StringIO()
                with redirect_stdout(stdout):
                    exit_code = main(
                        [
                            "--registry-file",
                            str(registry_path),
                            "system-info",
                            "lab-win",
                        ]
                    )

        payload = json.loads(stdout.getvalue())
        self.assertEqual(exit_code, 0)
        self.assertEqual(payload["operation"], "system-info")
        self.assertEqual(payload["data"]["computer_name"], "LAB-WIN")
        self.assertEqual(payload["data"]["drives"][0]["name"], "C:")
        info_mock.assert_called_once_with("lab-win", password_override=None)


if __name__ == "__main__":
    unittest.main()
