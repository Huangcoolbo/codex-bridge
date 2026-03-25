"""Core data models for host profiles and remote operation results."""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from typing import Any, Dict, Literal, Optional

AuthMethod = Literal["password", "key"]
OperationName = Literal["probe", "exec", "read-file", "list-dir", "write-file", "search-text", "system-info"]


@dataclass
class AuthConfig:
    """Authentication settings for a remote host."""

    method: AuthMethod = "key"
    password: Optional[str] = None
    key_path: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Serialize the auth config to a JSON-compatible dict."""
        return {
            "method": self.method,
            "password": self.password,
            "key_path": self.key_path,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "AuthConfig":
        """Build an auth config from stored JSON data."""
        method = data.get("method", "key")
        if method not in {"password", "key"}:
            raise ValueError("Unsupported auth method: {0}".format(method))
        return cls(
            method=method,
            password=data.get("password"),
            key_path=data.get("key_path"),
        )


@dataclass
class HostProfile:
    """Configuration for a single remote host."""

    name: str
    hostname: str
    username: str
    port: int = 22
    platform: str = "windows"
    transport: str = "ssh"
    auth: AuthConfig = field(default_factory=AuthConfig)
    description: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Serialize the profile to a JSON-compatible dict."""
        return {
            "name": self.name,
            "hostname": self.hostname,
            "username": self.username,
            "port": self.port,
            "platform": self.platform,
            "transport": self.transport,
            "auth": self.auth.to_dict(),
            "description": self.description,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "HostProfile":
        """Build a profile from stored JSON data."""
        return cls(
            name=data["name"],
            hostname=data["hostname"],
            username=data["username"],
            port=int(data.get("port", 22)),
            platform=data.get("platform", "windows"),
            transport=data.get("transport", "ssh"),
            auth=AuthConfig.from_dict(data.get("auth", {})),
            description=data.get("description"),
        )

    def with_password(self, password: str) -> "HostProfile":
        """Return a copy with a runtime password override applied."""
        return replace(self, auth=replace(self.auth, password=password))


@dataclass
class CommandResult:
    """Result of a remote command execution."""

    exit_code: int
    stdout: str
    stderr: str

    def to_dict(self) -> Dict[str, Any]:
        """Serialize the command result to a JSON-compatible dict."""
        return {
            "exit_code": self.exit_code,
            "stdout": self.stdout,
            "stderr": self.stderr,
        }


@dataclass
class DirectoryEntry:
    """Normalized directory item returned by a provider."""

    name: str
    full_name: str
    mode: str
    is_directory: bool
    length: Optional[int] = None
    last_write_time: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Serialize the entry to a JSON-compatible dict."""
        return {
            "name": self.name,
            "full_name": self.full_name,
            "mode": self.mode,
            "is_directory": self.is_directory,
            "length": self.length,
            "last_write_time": self.last_write_time,
        }


@dataclass
class SearchTextMatch:
    """One text match returned from a remote search operation."""

    path: str
    line_number: int
    line: str

    def to_dict(self) -> Dict[str, Any]:
        """Serialize the match to a JSON-compatible dict."""
        return {
            "path": self.path,
            "line_number": self.line_number,
            "line": self.line,
        }


@dataclass
class RemoteOperationResult:
    """Consistent result envelope for every remote bridge operation."""

    operation: OperationName
    command: CommandResult
    target: Dict[str, Any] = field(default_factory=dict)
    data: Any = None
    host: Optional[str] = None

    @property
    def success(self) -> bool:
        """Return whether the remote command finished successfully."""
        return self.command.exit_code == 0

    @property
    def exit_code(self) -> int:
        """Expose the underlying command exit code."""
        return self.command.exit_code

    @property
    def stdout(self) -> str:
        """Expose the underlying command stdout."""
        return self.command.stdout

    @property
    def stderr(self) -> str:
        """Expose the underlying command stderr."""
        return self.command.stderr

    def with_host(self, host: str) -> "RemoteOperationResult":
        """Return a copy tagged with the host name used for the operation."""
        return replace(self, host=host)

    def to_dict(self) -> Dict[str, Any]:
        """Serialize the result envelope to a JSON-compatible dict."""
        return {
            "host": self.host,
            "operation": self.operation,
            "success": self.success,
            "exit_code": self.exit_code,
            "stdout": self.stdout,
            "stderr": self.stderr,
            "target": self.target,
            "data": self._serialize(self.data),
        }

    @classmethod
    def from_command(
        cls,
        operation: OperationName,
        command: CommandResult,
        *,
        target: Optional[Dict[str, Any]] = None,
        data: Any = None,
        host: Optional[str] = None,
    ) -> "RemoteOperationResult":
        """Build a result envelope from a raw command result."""
        return cls(
            operation=operation,
            command=command,
            target=target or {},
            data=data,
            host=host,
        )

    @staticmethod
    def _serialize(value: Any) -> Any:
        if isinstance(value, list):
            return [RemoteOperationResult._serialize(item) for item in value]
        if isinstance(value, dict):
            return {str(key): RemoteOperationResult._serialize(item) for key, item in value.items()}
        if hasattr(value, "to_dict"):
            return value.to_dict()
        return value
