"""Windows provider implemented over an SSH transport adapter."""

from __future__ import annotations

import base64
import json
from typing import Any, List

from remote_agent_bridge.adapters.base import TransportAdapter
from remote_agent_bridge.exceptions import CommandExecutionError
from remote_agent_bridge.models import CommandResult, DirectoryEntry, RemoteOperationResult

from .base import RemoteProvider


class WindowsSSHProvider(RemoteProvider):
    """Expose Windows operations by executing PowerShell over SSH."""

    def __init__(self, transport: TransportAdapter) -> None:
        self.transport = transport

    def probe(self) -> RemoteOperationResult:
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
        payload = json.loads(result.stdout)
        return RemoteOperationResult.from_command("probe", result, data=payload)

    def execute(self, command: str) -> RemoteOperationResult:
        """Execute a PowerShell command and return the raw result envelope."""
        result = self._run_powershell(command)
        return RemoteOperationResult.from_command(
            "exec",
            result,
            target={"command": command},
            data={"command": command},
        )

    def read_file(self, path: str, encoding: str = "utf-8") -> RemoteOperationResult:
        """Read a text file through PowerShell with explicit metadata."""
        normalized_encoding = self._normalize_encoding(encoding)
        script = f"""
        [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
        $path = {self._ps_literal(path)}
        if (-not (Test-Path -LiteralPath $path)) {{
          throw "Remote file not found: $path"
        }}
        $item = Get-Item -LiteralPath $path -ErrorAction Stop
        if ($item.PSIsContainer) {{
          throw "Remote path is a directory, not a file: $path"
        }}
        $content = Get-Content -LiteralPath $path -Raw -Encoding {self._ps_literal(normalized_encoding)} -ErrorAction Stop
        $payload = [ordered]@{{
          path = $item.FullName
          encoding = {self._ps_literal(encoding)}
          size = $item.Length
          last_write_time = if ($item.LastWriteTime) {{ $item.LastWriteTime.ToString('o') }} else {{ $null }}
          content_base64 = [System.Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($content))
        }}
        $payload | ConvertTo-Json -Depth 4
        """
        result = self._run_powershell(script, check=True)
        payload = json.loads(result.stdout)
        content = base64.b64decode(payload["content_base64"]).decode("utf-8")
        return RemoteOperationResult.from_command(
            "read-file",
            result,
            target={"path": path, "encoding": encoding},
            data={
                "path": str(payload.get("path", path)),
                "encoding": str(payload.get("encoding", encoding)),
                "size": int(payload["size"]) if payload.get("size") is not None else None,
                "last_write_time": payload.get("last_write_time"),
                "content": content,
            },
        )

    def list_dir(self, path: str) -> RemoteOperationResult:
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
        entries: List[DirectoryEntry] = [
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
        return RemoteOperationResult.from_command(
            "list-dir",
            result,
            target={"path": path},
            data=entries,
        )

    def write_file(self, path: str, content: str, encoding: str = "utf-8") -> RemoteOperationResult:
        """Write text content to a file on the remote host."""
        encoded_content = base64.b64encode(content.encode(self._python_encoding(encoding))).decode("ascii")
        script = f"""
        $parent = Split-Path -Parent {self._ps_literal(path)}
        if ($parent) {{
          New-Item -ItemType Directory -Path $parent -Force | Out-Null
        }}
        $bytes = [System.Convert]::FromBase64String({self._ps_literal(encoded_content)})
        [System.IO.File]::WriteAllBytes({self._ps_literal(path)}, $bytes)
        """
        result = self._run_powershell(script, check=True)
        return RemoteOperationResult.from_command(
            "write-file",
            result,
            target={"path": path, "encoding": encoding},
            data={"path": path, "encoding": encoding, "bytes_written": len(content.encode(self._python_encoding(encoding)))},
        )

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

    @staticmethod
    def _python_encoding(encoding: str) -> str:
        lowered = encoding.lower()
        aliases = {
            "utf8": "utf-8",
            "unicode": "utf-16",
        }
        return aliases.get(lowered, encoding)
