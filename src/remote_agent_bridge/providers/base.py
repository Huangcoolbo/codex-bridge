"""Provider abstraction for remote platform operations."""

from __future__ import annotations

from abc import ABC, abstractmethod

from remote_agent_bridge.models import RemoteOperationResult


class RemoteProvider(ABC):
    """Platform-specific operations exposed to the service and CLI."""

    @abstractmethod
    def probe(self) -> RemoteOperationResult:
        """Return basic host metadata if the connection is healthy."""

    @abstractmethod
    def execute(self, command: str, cwd: str | None = None) -> RemoteOperationResult:
        """Execute a platform-native command, optionally inside a remote working directory."""

    @abstractmethod
    def read_file(self, path: str, encoding: str = "utf-8") -> RemoteOperationResult:
        """Read a text file from the remote host."""

    @abstractmethod
    def list_dir(self, path: str) -> RemoteOperationResult:
        """List directory contents on the remote host."""

    @abstractmethod
    def write_file(self, path: str, content: str, encoding: str = "utf-8") -> RemoteOperationResult:
        """Write a text file to the remote host."""

    @abstractmethod
    def search_text(
        self,
        path: str,
        pattern: str,
        *,
        encoding: str = "utf-8",
        recurse: bool = False,
    ) -> RemoteOperationResult:
        """Search for text inside one remote file or a directory tree."""

    @abstractmethod
    def close(self) -> None:
        """Release provider resources."""
