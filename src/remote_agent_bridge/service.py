"""Application service layer for host management and remote operations."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from remote_agent_bridge.exceptions import ProfileNotFoundError, WorkflowExecutionError
from remote_agent_bridge.factory import ProviderFactory
from remote_agent_bridge.models import CommandResult, HostProfile, RemoteOperationResult
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

    def system_info(self, name: str, password_override: Optional[str] = None) -> RemoteOperationResult:
        """Collect structured remote system information."""
        provider = self.factory.create(self.get_host(name), password_override=password_override)
        try:
            return provider.system_info().with_host(name)
        finally:
            provider.close()

    def workflow(
        self,
        name: str,
        steps: List[Dict[str, Any]],
        password_override: Optional[str] = None,
    ) -> RemoteOperationResult:
        """Run multiple remote steps in order and return a structured batch result."""
        provider = self.factory.create(self.get_host(name), password_override=password_override)
        try:
            results: List[RemoteOperationResult] = []
            for index, step in enumerate(steps):
                step_result = self._run_workflow_step(provider, step).with_host(name)
                if not step_result.success:
                    workflow_result = RemoteOperationResult.from_command(
                        "workflow",
                        CommandResult(
                            exit_code=step_result.exit_code,
                            stdout=step_result.stdout,
                            stderr=step_result.stderr,
                        ),
                        target={"step_count": len(steps)},
                        data={
                            "step_count": len(steps),
                            "completed_step_count": len(results),
                            "failed_step_index": index,
                            "steps": results,
                            "failed_step": step_result,
                        },
                        host=name,
                    )
                    raise WorkflowExecutionError("Workflow failed.", workflow_result)
                results.append(step_result)
            return RemoteOperationResult.from_command(
                "workflow",
                CommandResult(exit_code=0, stdout="", stderr=""),
                target={"step_count": len(steps)},
                data={
                    "step_count": len(steps),
                    "completed_step_count": len(results),
                    "steps": results,
                },
                host=name,
            )
        finally:
            provider.close()

    def _run_workflow_step(self, provider: Any, step: Dict[str, Any]) -> RemoteOperationResult:
        operation = str(step.get("operation", "")).strip()
        if not operation:
            raise ValueError("Each workflow step must include a non-empty 'operation'.")

        if operation == "exec":
            command = str(step.get("command", ""))
            if not command.strip():
                raise ValueError("Workflow exec step requires a non-empty 'command'.")
            return provider.execute(
                command,
                cwd=step.get("cwd"),
                timeout_seconds=step.get("timeout_seconds"),
            )

        if operation == "read-file":
            path = str(step.get("path", ""))
            if not path.strip():
                raise ValueError("Workflow read-file step requires a non-empty 'path'.")
            return provider.read_file(path, encoding=str(step.get("encoding", "utf-8")))

        if operation == "list-dir":
            path = str(step.get("path", ""))
            if not path.strip():
                raise ValueError("Workflow list-dir step requires a non-empty 'path'.")
            return provider.list_dir(path)

        if operation == "write-file":
            path = str(step.get("path", ""))
            if not path.strip():
                raise ValueError("Workflow write-file step requires a non-empty 'path'.")
            if "content" not in step:
                raise ValueError("Workflow write-file step requires 'content'.")
            return provider.write_file(
                path,
                content=str(step.get("content")),
                encoding=str(step.get("encoding", "utf-8")),
            )

        if operation == "search-text":
            path = str(step.get("path", ""))
            pattern = str(step.get("pattern", ""))
            if not path.strip():
                raise ValueError("Workflow search-text step requires a non-empty 'path'.")
            if not pattern.strip():
                raise ValueError("Workflow search-text step requires a non-empty 'pattern'.")
            return provider.search_text(
                path,
                pattern,
                encoding=str(step.get("encoding", "utf-8")),
                recurse=bool(step.get("recurse", False)),
            )

        if operation == "system-info":
            return provider.system_info()

        if operation == "probe":
            return provider.probe()

        raise ValueError(f"Unsupported workflow operation: {operation}")
