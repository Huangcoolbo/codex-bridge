"""Tests for the Android over adb provider."""

from __future__ import annotations

import base64
import unittest

from remote_agent_bridge.models import CommandResult
from remote_agent_bridge.providers.android import AndroidADBProvider


class FakeADBTransport:
    def __init__(self, results: list[CommandResult], push_result: CommandResult | None = None) -> None:
        self.results = list(results)
        self.push_result = push_result or CommandResult(exit_code=0, stdout="1 file pushed\n", stderr="")
        self.commands: list[str] = []
        self.push_calls: list[tuple[str, bytes]] = []
        self.closed = False

    def run(self, command: str, timeout: int | None = None) -> CommandResult:
        self.commands.append(command)
        if not self.results:
            raise AssertionError("No queued adb result for command")
        return self.results.pop(0)

    def push_content(self, remote_path: str, content: bytes, timeout: int | None = None) -> CommandResult:
        self.push_calls.append((remote_path, content))
        return self.push_result

    def close(self) -> None:
        self.closed = True


class AndroidADBProviderTests(unittest.TestCase):
    def test_probe_returns_structured_result(self) -> None:
        transport = FakeADBTransport(
            [
                CommandResult(
                    exit_code=0,
                    stdout=(
                        "computer_name=Pixel 8\n"
                        "current_user=shell\n"
                        "os_caption=Android\n"
                        "os_version=14\n"
                        "device=husky\n"
                        "sdk=34\n"
                        "serial_number=emulator-5554\n"
                    ),
                    stderr="",
                )
            ]
        )
        provider = AndroidADBProvider(transport)

        result = provider.probe()

        self.assertEqual(result.operation, "probe")
        self.assertEqual(result.data["computer_name"], "Pixel 8")
        self.assertEqual(result.data["sdk"], "34")
        self.assertIn("getprop ro.product.model", transport.commands[0])

    def test_execute_supports_remote_working_directory(self) -> None:
        transport = FakeADBTransport([CommandResult(exit_code=0, stdout="ok\n", stderr="")])
        provider = AndroidADBProvider(transport)

        result = provider.execute("pwd", cwd="/sdcard", timeout_seconds=5)

        self.assertEqual(result.operation, "exec")
        self.assertEqual(result.target["cwd"], "/sdcard")
        self.assertEqual(result.target["timeout_seconds"], 5)
        self.assertIn("cd '/sdcard'", transport.commands[0])
        self.assertIn("pwd", transport.commands[0])

    def test_read_file_returns_content_in_structured_data(self) -> None:
        content = "hello android\n"
        transport = FakeADBTransport(
            [
                CommandResult(
                    exit_code=0,
                    stdout="path=/sdcard/notes.txt\nsize=14\nlast_write_time=1710000000\n",
                    stderr="",
                ),
                CommandResult(
                    exit_code=0,
                    stdout=base64.b64encode(content.encode("utf-8")).decode("ascii"),
                    stderr="",
                ),
            ]
        )
        provider = AndroidADBProvider(transport)

        result = provider.read_file("/sdcard/notes.txt")

        self.assertEqual(result.operation, "read-file")
        self.assertEqual(result.data["path"], "/sdcard/notes.txt")
        self.assertEqual(result.data["size"], 14)
        self.assertEqual(result.data["content"], content)
        self.assertIn("base64 '/sdcard/notes.txt'", transport.commands[1])

    def test_list_dir_returns_directory_entries(self) -> None:
        transport = FakeADBTransport(
            [
                CommandResult(exit_code=0, stdout="/sdcard/a.txt\n/sdcard/dir\n", stderr=""),
                CommandResult(
                    exit_code=0,
                    stdout="path=/sdcard/a.txt\nis_directory=0\nsize=7\nlast_write_time=1710000001\n",
                    stderr="",
                ),
                CommandResult(
                    exit_code=0,
                    stdout="path=/sdcard/dir\nis_directory=1\nsize=\nlast_write_time=1710000002\n",
                    stderr="",
                ),
            ]
        )
        provider = AndroidADBProvider(transport)

        result = provider.list_dir("/sdcard")

        self.assertEqual(result.operation, "list-dir")
        self.assertEqual(result.data["item_count"], 2)
        self.assertEqual(result.data["entries"][0].name, "a.txt")
        self.assertFalse(result.data["entries"][0].is_directory)
        self.assertTrue(result.data["entries"][1].is_directory)

    def test_write_file_pushes_content_and_returns_metadata(self) -> None:
        transport = FakeADBTransport(
            [
                CommandResult(exit_code=0, stdout="", stderr=""),
                CommandResult(
                    exit_code=0,
                    stdout="path=/sdcard/out.txt\nsize=5\nlast_write_time=1710000003\n",
                    stderr="",
                ),
            ]
        )
        provider = AndroidADBProvider(transport)

        result = provider.write_file("/sdcard/out.txt", "hello")

        self.assertEqual(result.operation, "write-file")
        self.assertEqual(result.data["bytes_written"], 5)
        self.assertEqual(transport.push_calls[0][0], "/sdcard/out.txt")
        self.assertEqual(transport.push_calls[0][1], b"hello")

    def test_search_text_returns_structured_matches(self) -> None:
        transport = FakeADBTransport(
            [
                CommandResult(
                    exit_code=0,
                    stdout="path=/sdcard/logs\nis_directory=1\nsize=\nlast_write_time=1710000004\n",
                    stderr="",
                ),
                CommandResult(exit_code=0, stdout="/sdcard/logs/app.log\n/sdcard/logs/other.log\n", stderr=""),
                CommandResult(exit_code=0, stdout="4:needle first\n", stderr=""),
                CommandResult(exit_code=0, stdout="", stderr=""),
            ]
        )
        provider = AndroidADBProvider(transport)

        result = provider.search_text("/sdcard/logs", "needle", recurse=True)

        self.assertEqual(result.operation, "search-text")
        self.assertEqual(result.data["file_count"], 2)
        self.assertEqual(result.data["matched_file_count"], 1)
        self.assertEqual(result.data["match_count"], 1)
        self.assertEqual(result.data["matches"][0].path, "/sdcard/logs/app.log")
        self.assertEqual(result.data["matches"][0].line_number, 4)

    def test_system_info_returns_structured_payload(self) -> None:
        transport = FakeADBTransport(
            [
                CommandResult(
                    exit_code=0,
                    stdout=(
                        "manufacturer=Google\n"
                        "model=Pixel 8\n"
                        "device=husky\n"
                        "brand=google\n"
                        "os_caption=Android\n"
                        "os_version=14\n"
                        "sdk=34\n"
                        "fingerprint=fake/fingerprint\n"
                        "serial_number=emulator-5554\n"
                        "cpu_abi=arm64-v8a\n"
                        "current_user=shell\n"
                    ),
                    stderr="",
                )
            ]
        )
        provider = AndroidADBProvider(transport)

        result = provider.system_info()

        self.assertEqual(result.operation, "system-info")
        self.assertEqual(result.data["manufacturer"], "Google")
        self.assertEqual(result.data["drives"][0]["name"], "/sdcard")
        self.assertEqual(result.data["ipv4_addresses"], [])


if __name__ == "__main__":
    unittest.main()
