"""ADB transport adapter backed by the local adb executable."""

from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

from remote_agent_bridge.exceptions import BridgeError
from remote_agent_bridge.models import CommandResult, HostProfile

from .base import TransportAdapter


class ADBTransportAdapter(TransportAdapter):
    """Execute commands on an Android device through adb."""

    def __init__(self, profile: HostProfile, adb_executable: str | None = None) -> None:
        self.profile = profile
        self.adb_executable = adb_executable or shutil.which("adb")

    def run(self, command: str, timeout: Optional[int] = None) -> CommandResult:
        """Execute a shell command on the connected Android device."""
        return self._run_adb(["shell", "sh", "-c", command], timeout=timeout)

    def push_content(self, remote_path: str, content: bytes, timeout: Optional[int] = None) -> CommandResult:
        """Push raw file content to the device through a temporary local file."""
        self._ensure_adb_available()
        temp_path: str | None = None
        try:
            with tempfile.NamedTemporaryFile(delete=False) as handle:
                handle.write(content)
                temp_path = handle.name
            return self._run_adb(["push", temp_path, remote_path], timeout=timeout)
        finally:
            if temp_path is not None:
                Path(temp_path).unlink(missing_ok=True)

    def close(self) -> None:
        """Release any transport resources."""
        return None

    def _run_adb(self, arguments: list[str], timeout: Optional[int] = None) -> CommandResult:
        adb_path = self._ensure_adb_available()
        command = [adb_path]
        if self.profile.hostname:
            command.extend(["-s", self.profile.hostname])
        command.extend(arguments)
        try:
            completed = subprocess.run(command, capture_output=True, timeout=timeout, check=False)
        except subprocess.TimeoutExpired:
            return CommandResult(
                exit_code=124,
                stdout="",
                stderr=f"adb command timed out after {timeout} seconds.",
            )
        except OSError as error:
            raise BridgeError(f"Failed to run adb command: {error}") from error
        return CommandResult(
            exit_code=completed.returncode,
            stdout=completed.stdout.decode("utf-8", errors="replace"),
            stderr=completed.stderr.decode("utf-8", errors="replace"),
        )

    def _ensure_adb_available(self) -> str:
        if not self.adb_executable:
            raise BridgeError(
                "ADB support is not available on this machine yet. Install Android platform-tools first."
            )
        return self.adb_executable
