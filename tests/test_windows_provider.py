"""Tests for the Windows over SSH provider."""

from __future__ import annotations

import base64
import json
import unittest

from remote_agent_bridge.models import CommandResult
from remote_agent_bridge.providers.windows import WindowsSSHProvider


class FakeTransport:
    """Simple transport stub that records commands."""

    def __init__(self, result: CommandResult) -> None:
        self.result = result
        self.commands: list[str] = []
        self.closed = False

    def run(self, command: str, timeout: int | None = None) -> CommandResult:
        self.commands.append(command)
        return self.result

    def close(self) -> None:
        self.closed = True


class WindowsSSHProviderTests(unittest.TestCase):
    """Verify command formatting and result parsing."""

    def test_list_dir_parses_json_array(self) -> None:
        payload = json.dumps(
            [
                {
                    "Name": "file.txt",
                    "FullName": "C:\\Temp\\file.txt",
                    "Mode": "-a---",
                    "Length": 42,
                    "LastWriteTime": "2026-03-25T10:00:00",
                }
            ]
        )
        transport = FakeTransport(CommandResult(exit_code=0, stdout=payload, stderr=""))
        provider = WindowsSSHProvider(transport)

        entries = provider.list_dir("C:\\Temp")

        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0].name, "file.txt")
        self.assertTrue(transport.commands[0].startswith("powershell -NoProfile"))

    def test_execute_wraps_script_in_encoded_command(self) -> None:
        transport = FakeTransport(CommandResult(exit_code=0, stdout="", stderr=""))
        provider = WindowsSSHProvider(transport)

        provider.execute("Get-Date")

        command = transport.commands[0]
        encoded = command.rsplit(" ", 1)[-1]
        decoded = base64.b64decode(encoded).decode("utf-16le")
        self.assertEqual(decoded, "Get-Date")

    def test_write_file_embeds_base64_payload(self) -> None:
        transport = FakeTransport(CommandResult(exit_code=0, stdout="", stderr=""))
        provider = WindowsSSHProvider(transport)

        provider.write_file("C:\\Temp\\hello.txt", "hello world", encoding="utf-8")

        command = transport.commands[0]
        encoded = command.rsplit(" ", 1)[-1]
        decoded = base64.b64decode(encoded).decode("utf-16le")
        self.assertIn("WriteAllBytes", decoded)
        self.assertIn("aGVsbG8gd29ybGQ=", decoded)
        self.assertIn("C:\\Temp\\hello.txt", decoded)


if __name__ == "__main__":
    unittest.main()
