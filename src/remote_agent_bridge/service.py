"""Application service layer for host management and remote operations."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional, Tuple

from remote_agent_bridge.exceptions import (
    CommandExecutionError,
    ProfileNotFoundError,
    WorkflowExecutionError,
)
from remote_agent_bridge.factory import ProviderFactory
from remote_agent_bridge.models import CommandResult, HostProfile, RemoteOperationResult
from remote_agent_bridge.storage import HostRegistry

_TEMPLATE_PATTERN = re.compile(r"\{\{\s*(.+?)\s*\}\}")
_KEY_TOKEN_PATTERN = re.compile(r"[^.\[\]]+")
_INDEX_TOKEN_PATTERN = re.compile(r"\[(\d+)\]")


@dataclass(frozen=True)
class WorkflowOperationDefinition:
    """Describe how one workflow operation is validated and executed."""

    handler: Callable[[Any, Dict[str, Any]], RemoteOperationResult]
    required_fields: Tuple[str, ...] = ()


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
                resolved_step = step
                try:
                    resolved_step = self._resolve_workflow_templates(step, results)
                    step_result = self._run_workflow_step(provider, resolved_step).with_host(name)
                except CommandExecutionError as error:
                    failed_step = self._workflow_command_failure_step(
                        resolved_step,
                        command=error.result,
                        error_message=str(error),
                        host=name,
                    )
                    raise WorkflowExecutionError(
                        "Workflow failed.",
                        self._workflow_failure_result(name, steps, results, index, failed_step),
                    ) from error
                except ValueError as error:
                    failed_step = self._workflow_validation_failure_step(step, str(error), host=name)
                    raise WorkflowExecutionError(
                        "Workflow failed.",
                        self._workflow_failure_result(name, steps, results, index, failed_step),
                    ) from error
                if not step_result.success:
                    raise WorkflowExecutionError(
                        "Workflow failed.",
                        self._workflow_failure_result(name, steps, results, index, step_result),
                    )
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
        operation = self._workflow_step_operation(step)
        if operation == "workflow":
            raise ValueError("Each workflow step must include a non-empty 'operation'.")

        definition = self._workflow_operation_definitions().get(operation)
        if definition is None:
            raise ValueError(f"Unsupported workflow operation: {operation}")

        self._validate_workflow_step_fields(operation, step, definition.required_fields)
        return definition.handler(provider, step)

    @staticmethod
    def _workflow_operation_definitions() -> Dict[str, WorkflowOperationDefinition]:
        return {
            "exec": WorkflowOperationDefinition(
                handler=BridgeService._run_exec_workflow_step,
                required_fields=("command",),
            ),
            "read-file": WorkflowOperationDefinition(
                handler=BridgeService._run_read_file_workflow_step,
                required_fields=("path",),
            ),
            "list-dir": WorkflowOperationDefinition(
                handler=BridgeService._run_list_dir_workflow_step,
                required_fields=("path",),
            ),
            "write-file": WorkflowOperationDefinition(
                handler=BridgeService._run_write_file_workflow_step,
                required_fields=("path", "content"),
            ),
            "search-text": WorkflowOperationDefinition(
                handler=BridgeService._run_search_text_workflow_step,
                required_fields=("path", "pattern"),
            ),
            "system-info": WorkflowOperationDefinition(
                handler=BridgeService._run_system_info_workflow_step,
            ),
            "probe": WorkflowOperationDefinition(
                handler=BridgeService._run_probe_workflow_step,
            ),
        }

    @staticmethod
    def _validate_workflow_step_fields(
        operation: str,
        step: Dict[str, Any],
        required_fields: Tuple[str, ...],
    ) -> None:
        for field_name in required_fields:
            if field_name not in step:
                if field_name == "content":
                    raise ValueError(f"Workflow {operation} step requires '{field_name}'.")
                raise ValueError(f"Workflow {operation} step requires a non-empty '{field_name}'.")

            value = step.get(field_name)
            if field_name != "content" and not str(value).strip():
                raise ValueError(f"Workflow {operation} step requires a non-empty '{field_name}'.")

    @staticmethod
    def _run_exec_workflow_step(provider: Any, step: Dict[str, Any]) -> RemoteOperationResult:
        return provider.execute(
            str(step.get("command", "")),
            cwd=step.get("cwd"),
            timeout_seconds=step.get("timeout_seconds"),
        )

    @staticmethod
    def _run_read_file_workflow_step(provider: Any, step: Dict[str, Any]) -> RemoteOperationResult:
        return provider.read_file(
            str(step.get("path", "")),
            encoding=str(step.get("encoding", "utf-8")),
        )

    @staticmethod
    def _run_list_dir_workflow_step(provider: Any, step: Dict[str, Any]) -> RemoteOperationResult:
        return provider.list_dir(str(step.get("path", "")))

    @staticmethod
    def _run_write_file_workflow_step(provider: Any, step: Dict[str, Any]) -> RemoteOperationResult:
        return provider.write_file(
            str(step.get("path", "")),
            content=str(step.get("content")),
            encoding=str(step.get("encoding", "utf-8")),
        )

    @staticmethod
    def _run_search_text_workflow_step(provider: Any, step: Dict[str, Any]) -> RemoteOperationResult:
        return provider.search_text(
            str(step.get("path", "")),
            str(step.get("pattern", "")),
            encoding=str(step.get("encoding", "utf-8")),
            recurse=bool(step.get("recurse", False)),
        )

    @staticmethod
    def _run_system_info_workflow_step(provider: Any, step: Dict[str, Any]) -> RemoteOperationResult:
        del step
        return provider.system_info()

    @staticmethod
    def _run_probe_workflow_step(provider: Any, step: Dict[str, Any]) -> RemoteOperationResult:
        del step
        return provider.probe()

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
        expression_text = expression.strip()
        if not expression_text:
            raise ValueError("Workflow template expression cannot be empty.")

        parts = [part.strip() for part in expression_text.split("|")]
        path = parts[0]
        if not path:
            raise ValueError("Workflow template expression cannot be empty.")

        value = self._resolve_workflow_path(path, {"steps": results})
        for filter_name in parts[1:]:
            value = self._apply_workflow_template_filter(filter_name, value, expression_text)
        return value

    def _apply_workflow_template_filter(self, filter_name: str, value: Any, expression: str) -> Any:
        if not filter_name:
            raise ValueError(f"Workflow template filter cannot be empty: {expression}")
        if filter_name == "to-json":
            return json.dumps(self._workflow_template_value(value), ensure_ascii=False)
        raise ValueError(f"Unsupported workflow template filter: {filter_name}")

    def _resolve_workflow_path(self, path: str, context: Any) -> Any:
        current = context
        for key_token, index_token in self._workflow_path_tokens(path):
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

    def _workflow_path_tokens(self, path: str) -> List[Tuple[Optional[str], Optional[str]]]:
        tokens: List[Tuple[Optional[str], Optional[str]]] = []
        position = 0
        length = len(path)
        expecting_separator = False
        while position < length:
            if expecting_separator:
                if path[position] == ".":
                    position += 1
                elif path[position] != "[":
                    raise ValueError(f"Invalid workflow template path syntax: {path}")

            if position >= length:
                raise ValueError(f"Invalid workflow template path syntax: {path}")

            index_match = _INDEX_TOKEN_PATTERN.match(path, position)
            if index_match is not None:
                tokens.append((None, index_match.group(1)))
                position = index_match.end()
                expecting_separator = True
                continue

            key_match = _KEY_TOKEN_PATTERN.match(path, position)
            if key_match is not None:
                tokens.append((key_match.group(0), None))
                position = key_match.end()
                expecting_separator = True
                continue

            raise ValueError(f"Invalid workflow template path syntax: {path}")

        return tokens

    def _workflow_failure_result(
        self,
        name: str,
        steps: List[Dict[str, Any]],
        results: List[RemoteOperationResult],
        failed_step_index: int,
        failed_step: RemoteOperationResult,
    ) -> RemoteOperationResult:
        return RemoteOperationResult.from_command(
            "workflow",
            CommandResult(
                exit_code=failed_step.exit_code,
                stdout=failed_step.stdout,
                stderr=failed_step.stderr,
            ),
            target={"step_count": len(steps)},
            data={
                "step_count": len(steps),
                "completed_step_count": len(results),
                "failed_step_index": failed_step_index,
                "steps": results,
                "failed_step": failed_step,
            },
            host=name,
        )

    def _workflow_command_failure_step(
        self,
        step: Dict[str, Any],
        *,
        command: CommandResult,
        error_message: str,
        host: str,
    ) -> RemoteOperationResult:
        target = self._workflow_step_target(step)
        data = dict(target)
        data["error"] = error_message
        return RemoteOperationResult.from_command(
            self._workflow_step_operation(step),
            command,
            target=target,
            data=data,
            host=host,
        )

    def _workflow_validation_failure_step(
        self,
        step: Dict[str, Any],
        error_message: str,
        *,
        host: str,
    ) -> RemoteOperationResult:
        target = self._workflow_step_target(step)
        data = dict(target)
        data["error"] = error_message
        return RemoteOperationResult.from_command(
            self._workflow_step_operation(step),
            CommandResult(exit_code=1, stdout="", stderr=error_message),
            target=target,
            data=data,
            host=host,
        )

    @staticmethod
    def _workflow_step_operation(step: Dict[str, Any]) -> str:
        operation = str(step.get("operation", "")).strip()
        return operation or "workflow"

    @staticmethod
    def _workflow_step_target(step: Dict[str, Any]) -> Dict[str, Any]:
        return {str(key): value for key, value in step.items() if key != "operation"}

    def _workflow_template_value(self, value: Any) -> Any:
        if isinstance(value, RemoteOperationResult):
            return value.to_dict()
        if hasattr(value, "to_dict"):
            return value.to_dict()
        return value
