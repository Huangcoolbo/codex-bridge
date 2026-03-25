"""Core data models for host profiles and command results."""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from typing import Any, Dict, Literal, Optional

AuthMethod = Literal["password", "key"]


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


@dataclass
class DirectoryEntry:
    """Normalized directory item returned by a provider."""

    name: str
    full_name: str
    mode: str
    length: Optional[int] = None
    last_write_time: Optional[str] = None
