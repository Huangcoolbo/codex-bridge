"""CLI behavior tests."""

from __future__ import annotations

import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout
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
                target={"command": "Write-Output hello"},
                data={"command": "Write-Output hello"},
                host="lab-win",
            )

            with patch("remote_agent_bridge.cli.BridgeService.execute", return_value=result):
                stdout = io.StringIO()
                with redirect_stdout(stdout):
                    exit_code = main(
                        [
                            "--registry-file",
                            str(registry_path),
                            "exec",
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
        self.assertEqual(payload["stdout"], "hello\n")


if __name__ == "__main__":
    unittest.main()
