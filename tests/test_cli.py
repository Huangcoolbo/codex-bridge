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
from remote_agent_bridge.exceptions import WorkflowExecutionError
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

    def test_workflow_reads_json_file_and_prints_structured_steps(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            registry_path = Path(temp_dir) / "hosts.json"
            workflow_path = Path(temp_dir) / "workflow.json"
            workflow_path.write_text(
                json.dumps(
                    [
                        {"operation": "search-text", "path": "C:\\Logs", "pattern": "ERROR", "recurse": True},
                        {"operation": "read-file", "path": "C:\\Logs\\app.log"},
                    ]
                ),
                encoding="utf-8",
            )
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
                "workflow",
                CommandResult(exit_code=0, stdout="", stderr=""),
                target={"step_count": 2},
                data={
                    "step_count": 2,
                    "steps": [
                        RemoteOperationResult.from_command(
                            "search-text",
                            CommandResult(exit_code=0, stdout="{}", stderr=""),
                            target={"path": "C:\\Logs", "pattern": "ERROR", "encoding": "utf-8", "recurse": True},
                            data={"match_count": 1, "matches": [{"path": "C:\\Logs\\app.log", "line_number": 12, "line": "ERROR boom"}]},
                            host="lab-win",
                        ),
                        RemoteOperationResult.from_command(
                            "read-file",
                            CommandResult(exit_code=0, stdout="{}", stderr=""),
                            target={"path": "C:\\Logs\\app.log", "encoding": "utf-8"},
                            data={"path": "C:\\Logs\\app.log", "content": "ERROR boom", "encoding": "utf-8", "size": 10},
                            host="lab-win",
                        ),
                    ],
                },
                host="lab-win",
            )

            with patch("remote_agent_bridge.cli.BridgeService.workflow", return_value=result) as workflow_mock:
                stdout = io.StringIO()
                with redirect_stdout(stdout):
                    exit_code = main(
                        [
                            "--registry-file",
                            str(registry_path),
                            "workflow",
                            "lab-win",
                            "--workflow-file",
                            str(workflow_path),
                        ]
                    )

        payload = json.loads(stdout.getvalue())
        self.assertEqual(exit_code, 0)
        self.assertEqual(payload["operation"], "workflow")
        self.assertEqual(payload["data"]["step_count"], 2)
        self.assertEqual(payload["data"]["steps"][0]["operation"], "search-text")
        self.assertEqual(payload["data"]["steps"][1]["operation"], "read-file")
        workflow_mock.assert_called_once_with(
            "lab-win",
            [
                {"operation": "search-text", "path": "C:\\Logs", "pattern": "ERROR", "recurse": True},
                {"operation": "read-file", "path": "C:\\Logs\\app.log"},
            ],
            password_override=None,
        )

    def test_workflow_prints_partial_results_when_service_returns_structured_failure(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            registry_path = Path(temp_dir) / "hosts.json"
            workflow_path = Path(temp_dir) / "workflow.json"
            workflow_path.write_text(
                json.dumps(
                    [
                        {"operation": "read-file", "path": "C:\\Logs\\app.log"},
                        {"operation": "exec", "command": "FAIL-COMMAND"},
                    ]
                ),
                encoding="utf-8",
            )
            registry = HostRegistry(registry_path)
            registry.save_profile(
                HostProfile(
                    name="lab-win",
                    hostname="192.168.1.50",
                    username="admin",
                    auth=AuthConfig(method="key", key_path="C:\\keys\\id_ed25519"),
                )
            )
            failure_result = RemoteOperationResult.from_command(
                "workflow",
                CommandResult(exit_code=5, stdout="", stderr="boom"),
                target={"step_count": 2},
                data={
                    "step_count": 2,
                    "completed_step_count": 1,
                    "failed_step_index": 1,
                    "steps": [
                        RemoteOperationResult.from_command(
                            "read-file",
                            CommandResult(exit_code=0, stdout="{}", stderr=""),
                            target={"path": "C:\\Logs\\app.log", "encoding": "utf-8"},
                            data={"path": "C:\\Logs\\app.log", "content": "ok", "encoding": "utf-8"},
                            host="lab-win",
                        )
                    ],
                    "failed_step": RemoteOperationResult.from_command(
                        "exec",
                        CommandResult(exit_code=5, stdout="", stderr="boom"),
                        target={"command": "FAIL-COMMAND", "cwd": None, "timeout_seconds": None},
                        data={"command": "FAIL-COMMAND", "cwd": None, "timeout_seconds": None},
                        host="lab-win",
                    ),
                },
                host="lab-win",
            )

            with patch(
                "remote_agent_bridge.cli.BridgeService.workflow",
                side_effect=WorkflowExecutionError("Workflow failed.", failure_result),
            ):
                stdout = io.StringIO()
                with redirect_stdout(stdout):
                    exit_code = main(
                        [
                            "--registry-file",
                            str(registry_path),
                            "workflow",
                            "lab-win",
                            "--workflow-file",
                            str(workflow_path),
                        ]
                    )

        payload = json.loads(stdout.getvalue())
        self.assertEqual(exit_code, 5)
        self.assertEqual(payload["operation"], "workflow")
        self.assertFalse(payload["success"])
        self.assertEqual(payload["data"]["completed_step_count"], 1)
        self.assertEqual(payload["data"]["failed_step_index"], 1)
        self.assertEqual(payload["data"]["failed_step"]["operation"], "exec")

    def test_workflow_passes_template_steps_from_json_file_to_service(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            registry_path = Path(temp_dir) / "hosts.json"
            workflow_path = Path(temp_dir) / "workflow.json"
            workflow_steps = [
                {"operation": "search-text", "path": "C:\\Logs", "pattern": "ERROR", "recurse": True},
                {"operation": "read-file", "path": "{{ steps[0].data.matches[0].path }}"},
                {"operation": "exec", "command": "Write-Output 'line={{ steps[0].data.matches[0].line_number }}'"},
            ]
            workflow_path.write_text(json.dumps(workflow_steps), encoding="utf-8")
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
                "workflow",
                CommandResult(exit_code=0, stdout="", stderr=""),
                target={"step_count": 3},
                data={"step_count": 3, "steps": []},
                host="lab-win",
            )

            with patch("remote_agent_bridge.cli.BridgeService.workflow", return_value=result) as workflow_mock:
                stdout = io.StringIO()
                with redirect_stdout(stdout):
                    exit_code = main(
                        [
                            "--registry-file",
                            str(registry_path),
                            "workflow",
                            "lab-win",
                            "--workflow-file",
                            str(workflow_path),
                        ]
                    )

        self.assertEqual(exit_code, 0)
        workflow_mock.assert_called_once_with(
            "lab-win",
            workflow_steps,
            password_override=None,
        )

    def test_workflow_rejects_invalid_json_file(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            registry_path = Path(temp_dir) / "hosts.json"
            workflow_path = Path(temp_dir) / "workflow.json"
            workflow_path.write_text("{not-json}", encoding="utf-8")
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
                        "workflow",
                        "lab-win",
                        "--workflow-file",
                        str(workflow_path),
                    ]
                )

        self.assertEqual(exit_code, 1)
        self.assertIn("Failed to parse workflow file", stderr.getvalue())


    def test_host_add_defaults_android_adb_username_to_shell(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            registry_path = Path(temp_dir) / "hosts.json"
            stdout = io.StringIO()
            with redirect_stdout(stdout):
                exit_code = main(
                    [
                        "--registry-file",
                        str(registry_path),
                        "host",
                        "add",
                        "pixel",
                        "--hostname",
                        "emulator-5554",
                        "--platform",
                        "android",
                        "--transport",
                        "adb",
                    ]
                )

            registry = HostRegistry(registry_path)
            profile = registry.get_profile("pixel")

        self.assertEqual(exit_code, 0)
        self.assertIsNotNone(profile)
        assert profile is not None
        self.assertEqual(profile.username, "shell")
        self.assertEqual(profile.platform, "android")
        self.assertEqual(profile.transport, "adb")
if __name__ == "__main__":
    unittest.main()

