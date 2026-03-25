"""Application service layer for host management and remote operations."""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from remote_agent_bridge.exceptions import ProfileNotFoundError, WorkflowExecutionError
from remote_agent_bridge.factory import ProviderFactory
from remote_agent_bridge.models import CommandResult, HostProfile, RemoteOperationResult
from remote_agent_bridge.storage import HostRegistry

_TEMPLATE_PATTERN = re.compile(r"\{\{\s*(.+?)\s*\}\}")
_PATH_TOKEN_PATTERN = re.compile(r"([^.\[\]]+)|\[(\d+)\]")


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
                resolved_step = self._resolve_workflow_templates(step, results)
                step_result = self._run_workflow_step(provider, resolved_step).with_host(name)
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

    def _resolve_workflow_templates(
        self,
        value: Any,
        results: List[RemoteOperationResult],
    ) -> Any:
        if isinstance(value, dict):
            return {key: self._resolve_workflow_templates(item, results) for key, item in value.items()}
        if isinstance(value, list):
            return [self._resolve_workflow_templates(item, results) for item in value]
        if isinstance(value, str):
            return self._render_workflow_string(value, results)
        return value

    def _render_workflow_string(self, template: str, results: List[RemoteOperationResult]) -> Any:
        matches = list(_TEMPLATE_PATTERN.finditer(template))
        if not matches:
            return template
        if len(matches) == 1 and matches[0].span() == (0, len(template)):
            return self._resolve_workflow_expression(matches[0].group(1), results)

        rendered = template
        for match in matches:
            expression = match.group(1)
            rendered_value = self._resolve_workflow_expression(expression, results)
            rendered = rendered.replace(match.group(0), str(rendered_value))
        return rendered

    def _resolve_workflow_expression(self, expression: str, results: List[RemoteOperationResult]) -> Any:
        path = expression.strip()
        if not path:
            raise ValueError("Workflow template expression cannot be empty.")
        return self._resolve_workflow_path(path, {"steps": results})

    def _resolve_workflow_path(self, path: str, context: Any) -> Any:
        current = context
        for match in _PATH_TOKEN_PATTERN.finditer(path):
            key_token, index_token = match.groups()
            if key_token is not None:
                current = self._workflow_template_value(current)
                if isinstance(current, dict):
                    if key_token not in current:
                        raise ValueError(f"Workflow template path not found: {path}")
                    current = current[key_token]
                    continue
                raise ValueError(f"Workflow template path not found: {path}")
            if index_token is not None:
                current = self._workflow_template_value(current)
                if isinstance(current, list):
                    index = int(index_token)
                    try:
                        current = current[index]
                    except IndexError as error:
                        raise ValueError(f"Workflow template path not found: {path}") from error
                    continue
                raise ValueError(f"Workflow template path not found: {path}")
        return self._workflow_template_value(current)

    def _workflow_template_value(self, value: Any) -> Any:
        if isinstance(value, RemoteOperationResult):
            return value.to_dict()
        if hasattr(value, "to_dict"):
            return value.to_dict()
        return value
