"""Abstract transport adapter definitions."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Optional

from remote_agent_bridge.models import CommandResult


class TransportAdapter(ABC):
    """Transport contract used by platform providers."""

    @abstractmethod
    def run(self, command: str, timeout: Optional[int] = None) -> CommandResult:
        """Execute a remote command and return its result."""

    @abstractmethod
    def close(self) -> None:
        """Release any underlying transport resources."""
