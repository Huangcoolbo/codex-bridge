"""Provider abstraction for remote platform operations."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Dict, List

from remote_agent_bridge.models import CommandResult, DirectoryEntry


class RemoteProvider(ABC):
    """Platform-specific operations exposed to the service and CLI."""

    @abstractmethod
    def probe(self) -> Dict[str, Any]:
        """Return basic host metadata if the connection is healthy."""

    @abstractmethod
    def execute(self, command: str) -> CommandResult:
        """Execute a platform-native command."""

    @abstractmethod
    def read_file(self, path: str, encoding: str = "utf-8") -> str:
        """Read a text file from the remote host."""

    @abstractmethod
    def list_dir(self, path: str) -> List[DirectoryEntry]:
        """List directory contents on the remote host."""

    @abstractmethod
    def write_file(self, path: str, content: str, encoding: str = "utf-8") -> None:
        """Write a text file to the remote host."""

    @abstractmethod
    def close(self) -> None:
        """Release provider resources."""
