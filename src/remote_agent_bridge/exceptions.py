"""Project-specific exceptions."""

from __future__ import annotations

from remote_agent_bridge.models import CommandResult


class BridgeError(Exception):
    """Base exception for remote-agent-bridge."""


class ProfileNotFoundError(BridgeError):
    """Raised when a host profile cannot be found."""


class CommandExecutionError(BridgeError):
    """Raised when a remote command fails but a structured result exists."""

    def __init__(self, message: str, result: CommandResult) -> None:
        super().__init__(message)
        self.result = result

