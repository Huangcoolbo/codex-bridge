"""Shared service helpers for the local multi-platform desktop client."""

from __future__ import annotations

import shutil
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Dict, List, Optional

from remote_agent_bridge.exceptions import BridgeError, CommandExecutionError
from remote_agent_bridge.models import AuthConfig, CommandResult, HostProfile, RemoteOperationResult
from remote_agent_bridge.service import BridgeService
from remote_agent_bridge.storage import HostRegistry

DEFAULT_REGISTRY_FILE = Path.cwd() / "data" / "hosts.json"
ADB_CANDIDATES = (
    Path.home() / "AppData" / "Local" / "Android" / "Sdk" / "platform-tools" / "adb.exe",
    Path.home() / "AppData" / "Local" / "Microsoft" / "WinGet" / "Links" / "adb.exe",
)
WINGET_ADB_ROOT = Path.home() / "AppData" / "Local" / "Microsoft" / "WinGet" / "Packages"


@dataclass
class AndroidDevice:
    """One device visible from `adb devices -l`."""

    serial: str
    state: str
    details: Dict[str, str] = field(default_factory=dict)


@dataclass
class MDNSService:
    """One mDNS service returned by `adb mdns services`."""

    instance_name: str
    service_type: str
    address: str


Runner = Callable[[List[str], Optional[str], Optional[int]], CommandResult]


class AndroidADBClient:
    """Wrap local adb operations for wireless Android workflows."""

    def __init__(self, *, adb_executable: str | None = None, runner: Runner | None = None) -> None:
        self._adb_executable = adb_executable
        self._runner = runner or self._run_subprocess

    def resolve_adb_executable(self) -> str:
        """Resolve adb.exe from PATH, common install paths, or an explicit override."""
        if self._adb_executable:
            candidate = Path(self._adb_executable).expanduser()
            if not candidate.exists():
                raise BridgeError(f"ADB executable not found: {candidate}")
            return str(candidate)

        discovered = shutil.which("adb")
        if discovered:
            self._adb_executable = discovered
            return discovered

        for candidate in ADB_CANDIDATES:
            if candidate.exists():
                self._adb_executable = str(candidate)
                return self._adb_executable

        if WINGET_ADB_ROOT.exists():
            match = next(WINGET_ADB_ROOT.rglob("adb.exe"), None)
            if match is not None:
                self._adb_executable = str(match)
                return self._adb_executable

        raise BridgeError(
            "ADB is not available on this machine yet. Install Android platform-tools or select adb.exe manually."
        )

    def start_server(self) -> CommandResult:
        """Start the adb daemon."""
        return self._run_adb(["start-server"])

    def list_devices(self) -> List[AndroidDevice]:
        """Return parsed device data."""
        result = self._run_adb(["devices", "-l"], check=True)
        return self.parse_devices_output(result.stdout)

    def list_mdns_services(self) -> List[MDNSService]:
        """Return parsed mDNS data."""
        result = self._run_adb(["mdns", "services"], check=True)
        return self.parse_mdns_services_output(result.stdout)

    def pair(self, endpoint: str, pairing_code: str) -> CommandResult:
        """Pair with a wireless debugging endpoint."""
        normalized_endpoint = endpoint.strip()
        normalized_code = pairing_code.strip()
        if not normalized_endpoint:
            raise ValueError("Pairing endpoint is required.")
        if not normalized_code:
            raise ValueError("Pairing code is required.")
        return self._run_adb(["pair", normalized_endpoint], input_text=normalized_code + "\n")

    def connect(self, endpoint: str) -> CommandResult:
        """Connect to a wireless debugging endpoint."""
        normalized_endpoint = endpoint.strip()
        if not normalized_endpoint:
            raise ValueError("Connect endpoint is required.")
        return self._run_adb(["connect", normalized_endpoint])

    def disconnect(self, endpoint: str | None = None) -> CommandResult:
        """Disconnect from one endpoint or all wireless adb endpoints."""
        arguments = ["disconnect"]
        if endpoint and endpoint.strip():
            arguments.append(endpoint.strip())
        return self._run_adb(arguments)

    def _run_adb(
        self,
        arguments: List[str],
        *,
        input_text: str | None = None,
        timeout: int | None = None,
        check: bool = False,
    ) -> CommandResult:
        result = self._runner([self.resolve_adb_executable(), *arguments], input_text, timeout)
        if check and result.exit_code != 0:
            raise CommandExecutionError("ADB command failed.", result)
        return result

    @staticmethod
    def parse_devices_output(payload: str) -> List[AndroidDevice]:
        """Parse `adb devices -l` output."""
        devices: List[AndroidDevice] = []
        for raw_line in payload.splitlines():
            line = raw_line.strip()
            if not line or line.startswith("List of devices attached"):
                continue
            tokens = line.split()
            if len(tokens) < 2:
                continue
            details: Dict[str, str] = {}
            for token in tokens[2:]:
                if ":" not in token:
                    continue
                key, value = token.split(":", 1)
                details[key] = value
            devices.append(AndroidDevice(serial=tokens[0], state=tokens[1], details=details))
        return devices

    @staticmethod
    def parse_mdns_services_output(payload: str) -> List[MDNSService]:
        """Parse `adb mdns services` output."""
        services: List[MDNSService] = []
        for raw_line in payload.splitlines():
            line = raw_line.strip()
            if not line or line.startswith("List of discovered mdns services"):
                continue
            parts = line.split(maxsplit=2)
            if len(parts) == 3:
                services.append(MDNSService(parts[0], parts[1], parts[2]))
            elif len(parts) == 2:
                services.append(MDNSService(parts[0], parts[1], ""))
            else:
                services.append(MDNSService(parts[0], "", ""))
        return services

    @staticmethod
    def _run_subprocess(
        command: List[str],
        input_text: str | None,
        timeout: int | None,
    ) -> CommandResult:
        try:
            completed = subprocess.run(
                command,
                input=input_text,
                capture_output=True,
                text=True,
                timeout=timeout,
                check=False,
            )
        except subprocess.TimeoutExpired:
            return CommandResult(exit_code=124, stdout="", stderr=f"adb command timed out after {timeout} seconds.")
        except OSError as error:
            raise BridgeError(f"Failed to run adb command: {error}") from error
        return CommandResult(
            exit_code=completed.returncode,
            stdout=completed.stdout,
            stderr=completed.stderr,
        )


class BridgeClientService:
    """Local helper service for saving and probing bridge profiles."""

    def __init__(self, registry: HostRegistry | None = None) -> None:
        self.registry = registry or HostRegistry(DEFAULT_REGISTRY_FILE)
        self.bridge = BridgeService(self.registry)

    def list_hosts(self) -> List[HostProfile]:
        """Return all saved profiles."""
        return self.registry.list_profiles()

    def save_android_device(self, name: str, serial: str, description: str | None = None) -> HostProfile:
        """Persist an Android/ADB device profile."""
        normalized_name = name.strip()
        normalized_serial = serial.strip()
        if not normalized_name:
            raise ValueError("Profile name is required.")
        if not normalized_serial:
            raise ValueError("Device serial is required.")

        profile = HostProfile(
            name=normalized_name,
            hostname=normalized_serial,
            username="shell",
            platform="android",
            transport="adb",
            auth=AuthConfig(method="key"),
            description=description.strip() or None if description else None,
        )
        self.registry.save_profile(profile)
        return profile

    def save_windows_host(
        self,
        name: str,
        hostname: str,
        username: str,
        *,
        auth_method: str = "key",
        port: int = 22,
        key_path: str | None = None,
        password: str | None = None,
        description: str | None = None,
    ) -> HostProfile:
        """Persist a Windows/SSH host profile."""
        normalized_name = name.strip()
        normalized_hostname = hostname.strip()
        normalized_username = username.strip()
        if not normalized_name:
            raise ValueError("Profile name is required.")
        if not normalized_hostname:
            raise ValueError("Host/IP is required.")
        if not normalized_username:
            raise ValueError("Username is required.")
        if auth_method not in {"key", "password"}:
            raise ValueError("Auth method must be 'key' or 'password'.")
        if port <= 0:
            raise ValueError("Port must be a positive integer.")
        if auth_method == "key" and key_path and not Path(key_path).expanduser().exists():
            raise ValueError(f"SSH key not found: {key_path}")
        if auth_method == "password" and key_path:
            raise ValueError("Key path cannot be used with password auth.")

        profile = HostProfile(
            name=normalized_name,
            hostname=normalized_hostname,
            username=normalized_username,
            port=port,
            platform="windows",
            transport="ssh",
            auth=AuthConfig(method=auth_method, key_path=key_path, password=password),
            description=description.strip() or None if description else None,
        )
        self.registry.save_profile(profile)
        return profile

    def probe_host(self, name: str, password_override: str | None = None) -> RemoteOperationResult:
        """Probe a saved bridge profile."""
        return self.bridge.probe(name.strip(), password_override=password_override)

    def execute_host(
        self,
        name: str,
        command: str,
        *,
        cwd: str | None = None,
        timeout_seconds: int | None = None,
        password_override: str | None = None,
    ) -> RemoteOperationResult:
        """Execute a remote command against a saved bridge profile."""
        normalized_name = name.strip()
        normalized_command = command.strip()
        if not normalized_name:
            raise ValueError("Profile name is required.")
        if not normalized_command:
            raise ValueError("Command is required.")
        return self.bridge.execute(
            normalized_name,
            normalized_command,
            cwd=cwd.strip() or None if cwd else None,
            timeout_seconds=timeout_seconds,
            password_override=password_override,
        )
