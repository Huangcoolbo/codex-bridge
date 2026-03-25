"""Application service layer for host management and remote operations."""

from __future__ import annotations

from typing import List, Optional

from remote_agent_bridge.exceptions import ProfileNotFoundError
from remote_agent_bridge.factory import ProviderFactory
from remote_agent_bridge.models import HostProfile, RemoteOperationResult
from remote_agent_bridge.storage import HostRegistry


class BridgeService:
    """Coordinate registry access with provider execution."""

    def __init__(self, registry: HostRegistry, factory: Optional[ProviderFactory] = None) -> None:
        self.registry = registry
        self.factory = factory or ProviderFactory()

    def add_host(self, profile: HostProfile) -> None:
        """Save a host profile to the registry."""
        self.registry.save_profile(profile)

    def list_hosts(self) -> List[HostProfile]:
        """Return all known host profiles."""
        return self.registry.list_profiles()

    def get_host(self, name: str) -> HostProfile:
        """Resolve a host profile or raise an explicit error."""
        profile = self.registry.get_profile(name)
        if profile is None:
            raise ProfileNotFoundError("Host '{0}' is not registered.".format(name))
        return profile

    def probe(self, name: str, password_override: Optional[str] = None) -> RemoteOperationResult:
        """Probe a host for metadata."""
        provider = self.factory.create(self.get_host(name), password_override=password_override)
        try:
            return provider.probe().with_host(name)
        finally:
            provider.close()

    def execute(
        self,
        name: str,
        command: str,
        cwd: Optional[str] = None,
        timeout_seconds: Optional[int] = None,
        password_override: Optional[str] = None,
    ) -> RemoteOperationResult:
        """Execute a remote command on a host."""
        provider = self.factory.create(self.get_host(name), password_override=password_override)
        try:
            return provider.execute(
                command,
                cwd=cwd,
                timeout_seconds=timeout_seconds,
            ).with_host(name)
        finally:
            provider.close()

    def read_file(
        self,
        name: str,
        path: str,
        encoding: str = "utf-8",
        password_override: Optional[str] = None,
    ) -> RemoteOperationResult:
        """Read a remote file as text."""
        provider = self.factory.create(self.get_host(name), password_override=password_override)
        try:
            return provider.read_file(path, encoding=encoding).with_host(name)
        finally:
            provider.close()

    def list_dir(
        self, name: str, path: str, password_override: Optional[str] = None
    ) -> RemoteOperationResult:
        """List a remote directory."""
        provider = self.factory.create(self.get_host(name), password_override=password_override)
        try:
            return provider.list_dir(path).with_host(name)
        finally:
            provider.close()

    def write_file(
        self,
        name: str,
        path: str,
        content: str,
        encoding: str = "utf-8",
        password_override: Optional[str] = None,
    ) -> RemoteOperationResult:
        """Write text content to a remote file."""
        provider = self.factory.create(self.get_host(name), password_override=password_override)
        try:
            return provider.write_file(path, content=content, encoding=encoding).with_host(name)
        finally:
            provider.close()

    def search_text(
        self,
        name: str,
        path: str,
        pattern: str,
        *,
        encoding: str = "utf-8",
        recurse: bool = False,
        password_override: Optional[str] = None,
    ) -> RemoteOperationResult:
        """Search for text inside one remote file or a directory tree."""
        provider = self.factory.create(self.get_host(name), password_override=password_override)
        try:
            return provider.search_text(
                path,
                pattern,
                encoding=encoding,
                recurse=recurse,
            ).with_host(name)
        finally:
            provider.close()
