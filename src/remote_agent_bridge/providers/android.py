"""Android provider implemented over an adb transport adapter."""

from __future__ import annotations

import base64
from typing import Dict, List

from remote_agent_bridge.adapters.base import TransportAdapter
from remote_agent_bridge.exceptions import CommandExecutionError
from remote_agent_bridge.models import CommandResult, DirectoryEntry, RemoteOperationResult, SearchTextMatch

from .base import RemoteProvider


class AndroidADBProvider(RemoteProvider):
    """Expose Android operations by executing shell commands over adb."""

    def __init__(self, transport: TransportAdapter) -> None:
        self.transport = transport

    def probe(self) -> RemoteOperationResult:
        """Collect basic Android device metadata."""
        result = self._run_shell(
            """
            model="$(getprop ro.product.model)"
            device="$(getprop ro.product.device)"
            release="$(getprop ro.build.version.release)"
            sdk="$(getprop ro.build.version.sdk)"
            serial="$(getprop ro.serialno)"
            user="$(id -un 2>/dev/null || echo shell)"
            printf 'computer_name=%s\n' "$model"
            printf 'current_user=%s\n' "$user"
            printf 'os_caption=%s\n' 'Android'
            printf 'os_version=%s\n' "$release"
            printf 'device=%s\n' "$device"
            printf 'sdk=%s\n' "$sdk"
            printf 'serial_number=%s\n' "$serial"
            """,
            check=True,
        )
        return RemoteOperationResult.from_command("probe", result, data=self._parse_key_values(result.stdout))

    def execute(
        self,
        command: str,
        cwd: str | None = None,
        timeout_seconds: int | None = None,
    ) -> RemoteOperationResult:
        """Execute an Android shell command and return the raw result envelope."""
        cwd_block = ""
        if cwd:
            cwd_block = f"""
            if [ ! -d {self._sh_literal(cwd)} ]; then
              echo "Remote working directory not found: {cwd}" >&2
              exit 1
            fi
            cd {self._sh_literal(cwd)}
            """
        result = self._run_shell(
            f"""
            set -e
            {cwd_block}
            {command}
            """,
            timeout=timeout_seconds,
        )
        return RemoteOperationResult.from_command(
            "exec",
            result,
            target={"command": command, "cwd": cwd, "timeout_seconds": timeout_seconds},
            data={"command": command, "cwd": cwd, "timeout_seconds": timeout_seconds},
        )

    def read_file(self, path: str, encoding: str = "utf-8") -> RemoteOperationResult:
        """Read a text file from the Android device."""
        metadata = self._read_file_metadata(path)
        content_result = self._run_shell(
            f"base64 {self._sh_literal(path)}",
            check=True,
        )
        content = base64.b64decode(content_result.stdout.encode("ascii")).decode(self._python_encoding(encoding))
        return RemoteOperationResult.from_command(
            "read-file",
            CommandResult(
                exit_code=content_result.exit_code,
                stdout=content_result.stdout,
                stderr=self._combine_stderr(metadata.stderr, content_result.stderr),
            ),
            target={"path": path, "encoding": encoding},
            data={
                "path": metadata.data["path"],
                "encoding": encoding,
                "size": metadata.data["size"],
                "last_write_time": metadata.data["last_write_time"],
                "content": content,
            },
        )

    def list_dir(self, path: str) -> RemoteOperationResult:
        """List directory entries on the Android device."""
        child_paths = self._list_child_paths(path)
        entries: List[DirectoryEntry] = []
        for child_path in child_paths:
            metadata = self._read_path_metadata(child_path)
            entries.append(
                DirectoryEntry(
                    name=child_path.rsplit("/", 1)[-1],
                    full_name=metadata["path"],
                    mode="d" if metadata["is_directory"] else "-",
                    is_directory=metadata["is_directory"],
                    length=metadata["size"],
                    last_write_time=metadata["last_write_time"],
                )
            )
        return RemoteOperationResult.from_command(
            "list-dir",
            CommandResult(exit_code=0, stdout="\n".join(child_paths), stderr=""),
            target={"path": path},
            data={
                "path": path,
                "item_count": len(entries),
                "entries": entries,
            },
        )

    def write_file(self, path: str, content: str, encoding: str = "utf-8") -> RemoteOperationResult:
        """Write text content to a file on the Android device."""
        self._run_shell(
            f"""
            target={self._sh_literal(path)}
            parent=$(dirname "$target")
            if [ -e "$target" ] && [ -d "$target" ]; then
              echo "Remote write target is a directory, not a file: {path}" >&2
              exit 1
            fi
            mkdir -p "$parent"
            """,
            check=True,
        )
        payload = content.encode(self._python_encoding(encoding))
        if not hasattr(self.transport, "push_content"):
            raise ValueError("The configured transport does not support writing files.")
        push_result = self.transport.push_content(path, payload)
        if push_result.exit_code != 0:
            raise CommandExecutionError("Remote file upload failed.", push_result)
        metadata = self._read_file_metadata(path)
        return RemoteOperationResult.from_command(
            "write-file",
            push_result,
            target={"path": path, "encoding": encoding},
            data={
                "path": metadata.data["path"],
                "encoding": encoding,
                "bytes_written": metadata.data["size"],
                "last_write_time": metadata.data["last_write_time"],
            },
        )

    def search_text(
        self,
        path: str,
        pattern: str,
        *,
        encoding: str = "utf-8",
        recurse: bool = False,
    ) -> RemoteOperationResult:
        """Search for literal text inside one file or a directory tree on Android."""
        metadata = self._read_path_metadata(path)
        is_directory = metadata["is_directory"]
        if is_directory:
            file_paths = self._list_file_paths(path, recurse=recurse)
        else:
            file_paths = [metadata["path"]]

        matches: List[SearchTextMatch] = []
        matched_files: set[str] = set()
        for file_path in file_paths:
            grep_result = self._run_shell(
                f"grep -Fn -- {self._sh_literal(pattern)} {self._sh_literal(file_path)} || true"
            )
            for line in grep_result.stdout.splitlines():
                if not line.strip():
                    continue
                line_number_text, line_text = line.split(":", 1)
                matches.append(
                    SearchTextMatch(
                        path=file_path,
                        line_number=int(line_number_text),
                        line=line_text,
                    )
                )
                matched_files.add(file_path)

        return RemoteOperationResult.from_command(
            "search-text",
            CommandResult(exit_code=0, stdout="", stderr=""),
            target={"path": path, "pattern": pattern, "encoding": encoding, "recurse": recurse},
            data={
                "path": metadata["path"],
                "pattern": pattern,
                "encoding": encoding,
                "is_directory": is_directory,
                "recurse": recurse if is_directory else False,
                "file_count": len(file_paths),
                "matched_file_count": len(matched_files),
                "match_count": len(matches),
                "matches": matches,
            },
        )

    def system_info(self) -> RemoteOperationResult:
        """Collect structured Android system information for follow-up work."""
        result = self._run_shell(
            """
            printf 'manufacturer=%s\n' "$(getprop ro.product.manufacturer)"
            printf 'model=%s\n' "$(getprop ro.product.model)"
            printf 'device=%s\n' "$(getprop ro.product.device)"
            printf 'brand=%s\n' "$(getprop ro.product.brand)"
            printf 'os_caption=%s\n' 'Android'
            printf 'os_version=%s\n' "$(getprop ro.build.version.release)"
            printf 'sdk=%s\n' "$(getprop ro.build.version.sdk)"
            printf 'fingerprint=%s\n' "$(getprop ro.build.fingerprint)"
            printf 'serial_number=%s\n' "$(getprop ro.serialno)"
            printf 'cpu_abi=%s\n' "$(getprop ro.product.cpu.abi)"
            printf 'current_user=%s\n' "$(id -un 2>/dev/null || echo shell)"
            """,
            check=True,
        )
        data = self._parse_key_values(result.stdout)
        data["drives"] = [{"name": "/sdcard", "file_system": "android"}]
        data["ipv4_addresses"] = []
        return RemoteOperationResult.from_command(
            "system-info",
            result,
            data=data,
        )

    def close(self) -> None:
        """Close the underlying transport."""
        self.transport.close()

    def _run_shell(
        self,
        script: str,
        *,
        check: bool = False,
        timeout: int | None = None,
    ) -> CommandResult:
        result = self.transport.run(script.strip(), timeout=timeout)
        if check and result.exit_code != 0:
            raise CommandExecutionError("Remote shell command failed.", result)
        return result

    def _read_file_metadata(self, path: str) -> RemoteOperationResult:
        result = self._run_shell(
            f"""
            target={self._sh_literal(path)}
            if [ ! -e "$target" ]; then
              echo "Remote file not found: {path}" >&2
              exit 1
            fi
            if [ -d "$target" ]; then
              echo "Remote path is a directory, not a file: {path}" >&2
              exit 1
            fi
            size=$(wc -c < "$target" | tr -d ' ')
            mtime=$(stat -c %Y "$target" 2>/dev/null || toybox stat -c %Y "$target" 2>/dev/null || echo '')
            printf 'path=%s\n' "$target"
            printf 'size=%s\n' "$size"
            printf 'last_write_time=%s\n' "$mtime"
            """,
            check=True,
        )
        payload = self._parse_key_values(result.stdout)
        return RemoteOperationResult.from_command(
            "read-file",
            result,
            target={"path": path},
            data={
                "path": payload.get("path", path),
                "size": int(payload["size"]) if payload.get("size") else None,
                "last_write_time": payload.get("last_write_time") or None,
            },
        )

    def _read_path_metadata(self, path: str) -> Dict[str, object]:
        result = self._run_shell(
            f"""
            target={self._sh_literal(path)}
            if [ ! -e "$target" ]; then
              echo "Remote path not found: {path}" >&2
              exit 1
            fi
            if [ -d "$target" ]; then
              is_directory=1
              size=''
            else
              is_directory=0
              size=$(wc -c < "$target" 2>/dev/null | tr -d ' ')
            fi
            mtime=$(stat -c %Y "$target" 2>/dev/null || toybox stat -c %Y "$target" 2>/dev/null || echo '')
            printf 'path=%s\n' "$target"
            printf 'is_directory=%s\n' "$is_directory"
            printf 'size=%s\n' "$size"
            printf 'last_write_time=%s\n' "$mtime"
            """,
            check=True,
        )
        payload = self._parse_key_values(result.stdout)
        return {
            "path": payload.get("path", path),
            "is_directory": payload.get("is_directory") == "1",
            "size": int(payload["size"]) if payload.get("size") else None,
            "last_write_time": payload.get("last_write_time") or None,
        }

    def _list_child_paths(self, path: str) -> List[str]:
        result = self._run_shell(
            f"""
            target={self._sh_literal(path)}
            if [ ! -e "$target" ]; then
              echo "Remote directory not found: {path}" >&2
              exit 1
            fi
            if [ ! -d "$target" ]; then
              echo "Remote path is a file, not a directory: {path}" >&2
              exit 1
            fi
            for item in "$target"/* "$target"/.[!.]* "$target"/..?*; do
              if [ -e "$item" ]; then
                printf '%s\n' "$item"
              fi
            done
            """,
            check=True,
        )
        return [line for line in result.stdout.splitlines() if line.strip()]

    def _list_file_paths(self, path: str, *, recurse: bool) -> List[str]:
        target = self._sh_literal(path)
        if recurse:
            result = self._run_shell(
                f"""
                root={target}
                if [ ! -e "$root" ]; then
                  echo "Remote search path not found: {path}" >&2
                  exit 1
                fi
                if [ ! -d "$root" ]; then
                  echo "$root"
                  exit 0
                fi
                find "$root" -type f 2>/dev/null
                """,
                check=True,
            )
        else:
            result = self._run_shell(
                f"""
                root={target}
                if [ ! -e "$root" ]; then
                  echo "Remote search path not found: {path}" >&2
                  exit 1
                fi
                if [ ! -d "$root" ]; then
                  echo "$root"
                  exit 0
                fi
                for item in "$root"/* "$root"/.[!.]* "$root"/..?*; do
                  if [ -f "$item" ]; then
                    printf '%s\n' "$item"
                  fi
                done
                """,
                check=True,
            )
        return [line for line in result.stdout.splitlines() if line.strip()]

    @staticmethod
    def _parse_key_values(payload: str) -> Dict[str, str]:
        data: Dict[str, str] = {}
        for line in payload.splitlines():
            if not line.strip() or "=" not in line:
                continue
            key, value = line.split("=", 1)
            data[key] = value
        return data

    @staticmethod
    def _combine_stderr(*parts: str) -> str:
        return "\n".join(part for part in parts if part)

    @staticmethod
    def _sh_literal(value: str) -> str:
        return "'" + value.replace("'", "'\\''") + "'"

    @staticmethod
    def _python_encoding(encoding: str) -> str:
        lowered = encoding.lower()
        aliases = {
            "utf8": "utf-8",
            "unicode": "utf-16",
        }
        return aliases.get(lowered, encoding)
