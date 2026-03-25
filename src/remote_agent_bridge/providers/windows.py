"""Windows provider implemented over an SSH transport adapter."""

from __future__ import annotations

import base64
import json
from typing import Any

from remote_agent_bridge.adapters.base import TransportAdapter
from remote_agent_bridge.exceptions import CommandExecutionError
from remote_agent_bridge.models import CommandResult, DirectoryEntry

from .base import RemoteProvider


class WindowsSSHProvider(RemoteProvider):
    """Expose Windows operations by executing PowerShell over SSH."""

    def __init__(self, transport: TransportAdapter) -> None:
        self.transport = transport

    def probe(self) -> dict[str, Any]:
        """Collect basic Windows host metadata."""
        script = """
        $payload = [ordered]@{
          computer_name = $env:COMPUTERNAME
          current_user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
          os_caption = (Get-CimInstance Win32_OperatingSystem).Caption
          os_version = [System.Environment]::OSVersion.VersionString
          powershell_version = $PSVersionTable.PSVersion.ToString()
        }
        $payload | ConvertTo-Json -Depth 4
        """
        result = self._run_powershell(script, check=True)
        return json.loads(result.stdout)

    def execute(self, command: str) -> CommandResult:
        """Execute a PowerShell command and return the raw result."""
        return self._run_powershell(command)

    def read_file(self, path: str, encoding: str = "utf-8") -> str:
        """Read a text file through PowerShell."""
        script = f"""
        [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
        Get-Content -LiteralPath {self._ps_literal(path)} -Raw -Encoding {self._ps_literal(self._normalize_encoding(encoding))}
        """
        result = self._run_powershell(script, check=True)
        return result.stdout

    def list_dir(self, path: str) -> list[DirectoryEntry]:
        """List directory entries and normalize them into dataclasses."""
        script = f"""
        Get-ChildItem -LiteralPath {self._ps_literal(path)} -Force |
          Select-Object Name, FullName, Mode, Length, LastWriteTime |
          ConvertTo-Json -Depth 4
        """
        result = self._run_powershell(script, check=True)
        payload = json.loads(result.stdout) if result.stdout.strip() else []
        if isinstance(payload, dict):
            payload = [payload]
        return [
            DirectoryEntry(
                name=str(item["Name"]),
                full_name=str(item["FullName"]),
                mode=str(item["Mode"]),
                length=int(item["Length"]) if item.get("Length") is not None else None,
                last_write_time=str(item["LastWriteTime"])
                if item.get("LastWriteTime") is not None
                else None,
            )
            for item in payload
        ]

    def close(self) -> None:
        """Close the underlying transport."""
        self.transport.close()

    def _run_powershell(self, script: str, check: bool = False) -> CommandResult:
        command = (
            "powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand "
            f"{self._encode_powershell(script)}"
        )
        result = self.transport.run(command)
        if check and result.exit_code != 0:
            raise CommandExecutionError("Remote PowerShell command failed.", result)
        return result

    @staticmethod
    def _encode_powershell(script: str) -> str:
        normalized = script.strip().encode("utf-16le")
        return base64.b64encode(normalized).decode("ascii")

    @staticmethod
    def _ps_literal(value: str) -> str:
        return "'" + value.replace("'", "''") + "'"

    @staticmethod
    def _normalize_encoding(encoding: str) -> str:
        lowered = encoding.lower()
        aliases = {
            "utf-8": "utf8",
            "utf8": "utf8",
            "utf-16": "unicode",
            "utf16": "unicode",
            "ascii": "ascii",
        }
        return aliases.get(lowered, encoding)

