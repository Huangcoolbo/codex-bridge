"""SSH transport adapter backed by Paramiko."""

from __future__ import annotations

from pathlib import Path
from typing import Dict, Optional

from remote_agent_bridge.exceptions import BridgeError
from remote_agent_bridge.models import CommandResult, HostProfile

from .base import TransportAdapter

try:
    import paramiko
except ModuleNotFoundError:  # pragma: no cover - exercised through runtime behavior
    paramiko = None


class SSHTransportAdapter(TransportAdapter):
    """Execute commands on a remote host through SSH."""

    def __init__(self, profile: HostProfile) -> None:
        self.profile = profile
        self._client = None  # type: Optional["paramiko.SSHClient"]

    def run(self, command: str, timeout: Optional[int] = None) -> CommandResult:
        """Connect if necessary, then run a remote command."""
        client = self._get_client()
        stdin, stdout, stderr = client.exec_command(command, timeout=timeout)
        if stdin is not None:
            stdin.close()
        exit_code = stdout.channel.recv_exit_status()
        return CommandResult(
            exit_code=exit_code,
            stdout=stdout.read().decode("utf-8", errors="replace"),
            stderr=stderr.read().decode("utf-8", errors="replace"),
        )

    def close(self) -> None:
        """Close the SSH client if one is open."""
        if self._client is not None:
            self._client.close()
            self._client = None

    def _get_client(self) -> paramiko.SSHClient:
        if self._client is None:
            self._client = self._connect()
        return self._client

    def _load_known_hosts(self, client: "paramiko.SSHClient") -> None:
        client.load_system_host_keys()

        bridge_known_hosts = Path.cwd() / "data" / "known_hosts"
        if bridge_known_hosts.exists():
            client.load_host_keys(str(bridge_known_hosts))

    def _connect(self) -> "paramiko.SSHClient":
        if paramiko is None:
            raise BridgeError(
                "SSH support is not available on this machine yet. Install the project dependencies first."
            )

        client = paramiko.SSHClient()
        self._load_known_hosts(client)
        client.set_missing_host_key_policy(paramiko.RejectPolicy())

        auth = self.profile.auth
        connect_kwargs = {
            "hostname": self.profile.hostname,
            "port": self.profile.port,
            "username": self.profile.username,
            "timeout": 10,
            "banner_timeout": 10,
            "auth_timeout": 10,
        }  # type: Dict[str, object]
        if auth.method == "password":
            if not auth.password:
                raise ValueError(
                    "Host '{0}' requires a password but none was provided.".format(
                        self.profile.name
                    )
                )
            connect_kwargs["password"] = auth.password
            connect_kwargs["look_for_keys"] = False
            connect_kwargs["allow_agent"] = False
        else:
            if auth.key_path:
                connect_kwargs["key_filename"] = str(Path(auth.key_path).expanduser())
                connect_kwargs["look_for_keys"] = False
                connect_kwargs["allow_agent"] = False
            else:
                connect_kwargs["look_for_keys"] = True
                connect_kwargs["allow_agent"] = True

        client.connect(**connect_kwargs)
        return client

