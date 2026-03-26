"""Factory for building providers from host profiles."""

from __future__ import annotations

from remote_agent_bridge.models import HostProfile
from remote_agent_bridge.providers.base import RemoteProvider


class ProviderFactory:
    """Instantiate the correct provider and transport for a host profile."""

    def create(self, profile: HostProfile, password_override: str | None = None) -> RemoteProvider:
        """Build a provider for the given profile."""
        effective_profile = profile.with_password(password_override) if password_override else profile
        if effective_profile.platform == "windows" and effective_profile.transport == "ssh":
            from remote_agent_bridge.adapters.ssh import SSHTransportAdapter
            from remote_agent_bridge.providers.windows import WindowsSSHProvider

            return WindowsSSHProvider(SSHTransportAdapter(effective_profile))
        if effective_profile.platform == "android" and effective_profile.transport == "adb":
            from remote_agent_bridge.adapters.adb import ADBTransportAdapter
            from remote_agent_bridge.providers.android import AndroidADBProvider

            return AndroidADBProvider(ADBTransportAdapter(effective_profile))
        raise ValueError(
            "Unsupported host configuration: "
            f"platform={effective_profile.platform!r}, transport={effective_profile.transport!r}"
        )
