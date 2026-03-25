"""Tests for the Windows over SSH provider."""

from __future__ import annotations

import base64
import json
import unittest

from remote_agent_bridge.exceptions import CommandExecutionError
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

    def test_probe_returns_structured_result(self) -> None:
        payload = json.dumps(
            {
                "computer_name": "LAB-WIN",
                "current_user": "LAB\\admin",
                "os_caption": "Microsoft Windows 11 Pro",
                "os_version": "10.0.26100.0",
                "powershell_version": "5.1.26100.1",
            }
        )
        transport = FakeTransport(CommandResult(exit_code=0, stdout=payload, stderr=""))
        provider = WindowsSSHProvider(transport)

        result = provider.probe()

        self.assertEqual(result.operation, "probe")
        self.assertTrue(result.success)
        self.assertEqual(result.data["computer_name"], "LAB-WIN")

    def test_list_dir_returns_directory_metadata_and_entries(self) -> None:
        payload = json.dumps(
            {
                "path": "C:\\Temp",
                "item_count": 1,
                "entries": [
                    {
                        "Name": "file.txt",
                        "FullName": "C:\\Temp\\file.txt",
                        "Mode": "-a---",
                        "IsDirectory": False,
                        "Length": 42,
                        "LastWriteTime": "2026-03-25T10:00:00.0000000+08:00",
                    }
                ],
            }
        )
        transport = FakeTransport(CommandResult(exit_code=0, stdout=payload, stderr=""))
        provider = WindowsSSHProvider(transport)

        result = provider.list_dir("C:\\Temp")

        self.assertEqual(result.operation, "list-dir")
        self.assertEqual(result.data["path"], "C:\\Temp")
        self.assertEqual(result.data["item_count"], 1)
        self.assertEqual(len(result.data["entries"]), 1)
        self.assertEqual(result.data["entries"][0].name, "file.txt")
        self.assertFalse(result.data["entries"][0].is_directory)
        self.assertEqual(result.target["path"], "C:\\Temp")
        self.assertTrue(transport.commands[0].startswith("powershell -NoProfile"))

        command = transport.commands[0]
        encoded = command.rsplit(" ", 1)[-1]
        decoded = base64.b64decode(encoded).decode("utf-16le")
        self.assertIn("Remote directory not found", decoded)
        self.assertIn("Remote path is a file, not a directory", decoded)
        self.assertIn("item_count = $entries.Count", decoded)

    def test_list_dir_handles_empty_directory_payload(self) -> None:
        payload = json.dumps(
            {
                "path": "C:\\Empty",
                "item_count": 0,
                "entries": [],
            }
        )
        transport = FakeTransport(CommandResult(exit_code=0, stdout=payload, stderr=""))
        provider = WindowsSSHProvider(transport)

        result = provider.list_dir("C:\\Empty")

        self.assertEqual(result.data["path"], "C:\\Empty")
        self.assertEqual(result.data["item_count"], 0)
        self.assertEqual(result.data["entries"], [])

    def test_list_dir_raises_structured_error_on_failure(self) -> None:
        transport = FakeTransport(
            CommandResult(exit_code=1, stdout="", stderr="Remote directory not found: C:\\Missing")
        )
        provider = WindowsSSHProvider(transport)

        with self.assertRaises(CommandExecutionError) as context:
            provider.list_dir("C:\\Missing")

        self.assertEqual(context.exception.result.stderr, "Remote directory not found: C:\\Missing")

    def test_execute_wraps_script_in_encoded_command(self) -> None:
        transport = FakeTransport(CommandResult(exit_code=0, stdout="ok\n", stderr=""))
        provider = WindowsSSHProvider(transport)

        result = provider.execute("Get-Date")

        command = transport.commands[0]
        encoded = command.rsplit(" ", 1)[-1]
        decoded = base64.b64decode(encoded).decode("utf-16le")
        self.assertEqual(decoded, "Get-Date")
        self.assertEqual(result.operation, "exec")
        self.assertEqual(result.target["command"], "Get-Date")
        self.assertEqual(result.stdout, "ok\n")

    def test_read_file_returns_content_in_structured_data(self) -> None:
        payload = json.dumps(
            {
                "path": "C:\\Temp\\hello.txt",
                "encoding": "utf-8",
                "size": 12,
                "last_write_time": "2026-03-25T11:00:00.0000000+08:00",
                "content_base64": base64.b64encode("hello world\n".encode("utf-8")).decode("ascii"),
            }
        )
        transport = FakeTransport(CommandResult(exit_code=0, stdout=payload, stderr=""))
        provider = WindowsSSHProvider(transport)

        result = provider.read_file("C:\\Temp\\hello.txt", encoding="utf-8")

        command = transport.commands[0]
        encoded = command.rsplit(" ", 1)[-1]
        decoded = base64.b64decode(encoded).decode("utf-16le")
        self.assertIn("Test-Path -LiteralPath $path", decoded)
        self.assertIn("content_base64", decoded)
        self.assertEqual(result.operation, "read-file")
        self.assertEqual(result.target["path"], "C:\\Temp\\hello.txt")
        self.assertEqual(result.data["path"], "C:\\Temp\\hello.txt")
        self.assertEqual(result.data["content"], "hello world\n")
        self.assertEqual(result.data["encoding"], "utf-8")
        self.assertEqual(result.data["size"], 12)
        self.assertEqual(result.data["last_write_time"], "2026-03-25T11:00:00.0000000+08:00")

    def test_write_file_embeds_base64_payload(self) -> None:
        transport = FakeTransport(CommandResult(exit_code=0, stdout="", stderr=""))
        provider = WindowsSSHProvider(transport)

        result = provider.write_file("C:\\Temp\\hello.txt", "hello world", encoding="utf-8")

        command = transport.commands[0]
        encoded = command.rsplit(" ", 1)[-1]
        decoded = base64.b64decode(encoded).decode("utf-16le")
        self.assertIn("WriteAllBytes", decoded)
        self.assertIn("aGVsbG8gd29ybGQ=", decoded)
        self.assertIn("C:\\Temp\\hello.txt", decoded)
        self.assertEqual(result.operation, "write-file")
        self.assertEqual(result.data["bytes_written"], len("hello world".encode("utf-8")))


if __name__ == "__main__":
    unittest.main()
