"""CLI entrypoint for codex-bridge."""

from __future__ import annotations

import argparse
import getpass
import json
import sys
from pathlib import Path
from typing import Sequence

from remote_agent_bridge.exceptions import BridgeError, CommandExecutionError
from remote_agent_bridge.models import AuthConfig, DirectoryEntry, HostProfile
from remote_agent_bridge.service import BridgeService
from remote_agent_bridge.storage import HostRegistry

DEFAULT_REGISTRY_FILE = Path.cwd() / "data" / "hosts.json"


def main(argv: Sequence[str] | None = None) -> int:
    """Run the CLI and return a process exit code."""
    parser = build_parser()
    args = parser.parse_args(argv)
    service = BridgeService(HostRegistry(args.registry_file))

    try:
        if args.command == "host":
            return _handle_host_command(service, args)
        if args.command == "probe":
            payload = service.probe(args.name, password_override=_password_for(service, args.name))
            print(json.dumps(payload, indent=2))
            return 0
        if args.command == "exec":
            command = " ".join(args.remote_command).strip()
            if not command:
                parser.error("exec requires a remote command after '--'.")
            result = service.execute(
                args.name,
                command,
                password_override=_password_for(service, args.name),
            )
            if result.stdout:
                print(result.stdout, end="" if result.stdout.endswith("\n") else "\n")
            if result.stderr:
                print(result.stderr, file=sys.stderr, end="" if result.stderr.endswith("\n") else "\n")
            return result.exit_code
        if args.command == "read-file":
            contents = service.read_file(
                args.name,
                args.path,
                encoding=args.encoding,
                password_override=_password_for(service, args.name),
            )
            print(contents, end="" if contents.endswith("\n") else "\n")
            return 0
        if args.command == "list-dir":
            entries = service.list_dir(
                args.name,
                args.path,
                password_override=_password_for(service, args.name),
            )
            print(json.dumps([_entry_to_dict(item) for item in entries], indent=2))
            return 0
        if args.command == "write-file":
            content = _resolve_write_content(args)
            service.write_file(
                args.name,
                args.path,
                content=content,
                encoding=args.encoding,
                password_override=_password_for(service, args.name),
            )
            print(f"Wrote remote file: {args.path}")
            return 0
        parser.print_help()
        return 1
    except BridgeError as error:
        print(str(error), file=sys.stderr)
        if isinstance(error, CommandExecutionError):
            if error.result.stderr:
                print(error.result.stderr, file=sys.stderr, end="" if error.result.stderr.endswith("\n") else "\n")
            return error.result.exit_code or 1
        return 1
    except ValueError as error:
        print(str(error), file=sys.stderr)
        return 1


def build_parser() -> argparse.ArgumentParser:
    """Construct the top-level CLI parser."""
    parser = argparse.ArgumentParser(prog="codex-bridge")
    parser.add_argument(
        "--registry-file",
        type=Path,
        default=DEFAULT_REGISTRY_FILE,
        help="Path to the host registry file. Defaults to ./data/hosts.json",
    )

    subparsers = parser.add_subparsers(dest="command")

    host_parser = subparsers.add_parser("host", help="Manage host profiles.")
    host_subparsers = host_parser.add_subparsers(dest="host_command")

    add_parser = host_subparsers.add_parser("add", help="Add or update a host profile.")
    add_parser.add_argument("name", help="Logical host name.")
    add_parser.add_argument("--hostname", required=True, help="SSH hostname or IP.")
    add_parser.add_argument("--username", required=True, help="SSH username.")
    add_parser.add_argument("--port", type=int, default=22, help="SSH port.")
    add_parser.add_argument("--platform", default="windows", help="Target platform name.")
    add_parser.add_argument("--transport", default="ssh", help="Transport type.")
    add_parser.add_argument("--auth", choices=["password", "key"], default="key", help="Auth mode.")
    add_parser.add_argument("--key-path", help="SSH key path for key auth.")
    add_parser.add_argument(
        "--store-password",
        action="store_true",
        help="Prompt for a password and store it in the local registry.",
    )
    add_parser.add_argument("--description", help="Optional description.")

    host_subparsers.add_parser("list", help="List known hosts.")

    probe_parser = subparsers.add_parser("probe", help="Probe a remote host.")
    probe_parser.add_argument("name", help="Host name.")

    exec_parser = subparsers.add_parser("exec", help="Execute a PowerShell command.")
    exec_parser.add_argument("name", help="Host name.")
    exec_parser.add_argument("remote_command", nargs=argparse.REMAINDER, help="Command after '--'.")

    read_parser = subparsers.add_parser("read-file", help="Read a text file from the remote host.")
    read_parser.add_argument("name", help="Host name.")
    read_parser.add_argument("path", help="Remote file path.")
    read_parser.add_argument("--encoding", default="utf-8", help="File encoding to request.")

    list_parser = subparsers.add_parser("list-dir", help="List a remote directory.")
    list_parser.add_argument("name", help="Host name.")
    list_parser.add_argument("path", help="Remote directory path.")

    write_parser = subparsers.add_parser("write-file", help="Write a text file to the remote host.")
    write_parser.add_argument("name", help="Host name.")
    write_parser.add_argument("path", help="Remote file path.")
    write_parser.add_argument("--content", help="Inline text content to write.")
    write_parser.add_argument("--content-file", help="Local file to read and send.")
    write_parser.add_argument("--encoding", default="utf-8", help="Text encoding to use.")

    return parser


def _handle_host_command(service: BridgeService, args: argparse.Namespace) -> int:
    if args.host_command == "add":
        if args.auth == "password" and args.key_path:
            raise ValueError("--key-path cannot be used with password auth.")
        if args.auth == "key" and args.store_password:
            raise ValueError("--store-password only applies to password auth.")

        password = getpass.getpass("Password: ") if args.store_password else None
        profile = HostProfile(
            name=args.name,
            hostname=args.hostname,
            username=args.username,
            port=args.port,
            platform=args.platform,
            transport=args.transport,
            description=args.description,
            auth=AuthConfig(method=args.auth, password=password, key_path=args.key_path),
        )
        service.add_host(profile)
        print(f"Saved host profile '{profile.name}' to {service.registry.path}")
        return 0

    if args.host_command == "list":
        profiles = service.list_hosts()
        if not profiles:
            print("No hosts registered.")
            return 0
        for profile in profiles:
            target = f"{profile.username}@{profile.hostname}:{profile.port}"
            print(
                f"{profile.name}\t{profile.platform}/{profile.transport}\t"
                f"{profile.auth.method}\t{target}"
            )
        return 0

    raise ValueError("A host subcommand is required.")


def _password_for(service: BridgeService, host_name: str) -> str | None:
    profile = service.get_host(host_name)
    if profile.auth.method == "password" and not profile.auth.password:
        return getpass.getpass(f"Password for {profile.username}@{profile.hostname}: ")
    return None


def _entry_to_dict(entry: DirectoryEntry) -> dict[str, object]:
    return {
        "name": entry.name,
        "full_name": entry.full_name,
        "mode": entry.mode,
        "length": entry.length,
        "last_write_time": entry.last_write_time,
    }


def _resolve_write_content(args: argparse.Namespace) -> str:
    has_inline = args.content is not None
    has_file = args.content_file is not None
    if has_inline == has_file:
        raise ValueError("Provide exactly one of --content or --content-file.")
    if has_file:
        return Path(args.content_file).read_text(encoding=args.encoding)
    return str(args.content)
