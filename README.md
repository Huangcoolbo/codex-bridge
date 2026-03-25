# codex-bridge

[中文说明](./README.zh-CN.md) | [English](./README.md)

`codex-bridge` is a Python MVP for remote machine control with a clean separation between:

- providers, which model platform behavior such as Windows filesystem and PowerShell commands
- adapters, which model transport behavior such as SSH

The first concrete implementation is Windows over OpenSSH. The structure is intended to support future Linux and Android providers without rewriting the CLI or host registry layers.

## Features

- host profile registry stored locally in `data/hosts.json`
- provider/adapter architecture with a Windows provider over an SSH transport
- CLI commands for `host add`, `host list`, `probe`, `exec`, `read-file`, `system-info`, `list-dir`, `write-file`, `search-text`, and `workflow`, with `exec` supporting inline commands, a local PowerShell script file, and an optional timeout
- consistent JSON result envelope across `probe`, `exec`, `read-file`, `system-info`, `list-dir`, `write-file`, `search-text`, and `workflow`
- password or key-based SSH auth in the host schema
- runtime password prompting when the profile omits a stored password
- basic tests for storage, service, CLI, and Windows provider behavior

## Requirements

- Python 3.8+
- OpenSSH server enabled on the remote Windows machine
- a reachable SSH account on that machine
- host keys trusted in your local SSH known hosts file

## Install

```bash
python -m venv .venv
. .venv/Scripts/activate
pip install -e .
pip install pytest
```

If you run tests from a fresh checkout, `pytest.ini` and `tests/conftest.py` now make the `src` layout work without requiring a manual `PYTHONPATH=src` step.

## Quick Start

Use the ready-made PowerShell scripts for common tasks.

Current helper scripts:

- `scripts/init.ps1`
- `scripts/add-windows-host.ps1`
- `scripts/list-hosts.ps1`
- `scripts/probe-host.ps1`
- `scripts/exec-remote.ps1`
- `scripts/read-remote-file.ps1`
- `scripts/system-info.ps1`
- `scripts/list-remote-dir.ps1`
- `scripts/write-remote-file.ps1`
- `scripts/search-remote-text.ps1`
- `scripts/run-remote-workflow.ps1`

### 1. Initialize the project environment

This script uses **Python 3.13** by default. If an old environment already exists, it rebuilds it from scratch.

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\init.ps1
```

### 2. Add a Windows host with key auth

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\add-windows-host.ps1 `
  -Name lab-win `
  -HostName 192.168.1.50 `
  -UserName admin `
  -Auth key `
  -KeyPath C:\Users\you\.ssh\id_ed25519
```

### 3. List registered hosts

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\list-hosts.ps1
```

### 4. Probe a host

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\probe-host.ps1 -Name lab-win
```

### 5. Optional: use the CLI directly

All remote operation commands now print the same JSON envelope shape:

```json
{
  "host": "lab-win",
  "operation": "read-file",
  "success": true,
  "exit_code": 0,
  "stdout": "raw remote stdout",
  "stderr": "",
  "target": {"path": "C:\\Temp\\notes.txt", "encoding": "utf-8"},
  "data": {
    "path": "C:\\Temp\\notes.txt",
    "content": "...",
    "encoding": "utf-8",
    "size": 123,
    "last_write_time": "2026-03-25T11:00:00+08:00"
  }
}
```

For `read-file`, the bridge now returns file metadata together with text content so a caller can decide the next remote step without issuing another stat command.

For `system-info`, the bridge now returns structured Windows machine details like OS version, current user, memory size, IPv4 addresses, and local drives so a caller can quickly judge the remote environment before deciding the next step.

For `list-dir`, the bridge now verifies that the target exists and is really a directory, then returns the normalized directory path, item count, and per-entry type metadata so a caller can safely chain follow-up operations.

For `exec`, the bridge now forces PowerShell to stop on command errors, emits UTF-8 output, can optionally switch into a validated remote working directory first, can apply a remote execution timeout, and can read a local PowerShell script file before sending it to the remote host, so remote failures and multi-step command chaining are easier to judge from one result.

For `write-file`, the bridge now checks that the parent path is really a directory, rejects writing into a directory path by mistake, and returns the final normalized path, byte count, and last write time after the file is written.

For `search-text`, the bridge can now search one remote file or a whole directory tree for a literal text pattern, and returns file count, match count, and matched lines so a caller can decide which remote file to inspect next.

For `workflow`, the bridge can now run an ordered JSON step list in one call and return every sub-step as its own structured result, so a caller can batch a small remote investigation loop like search -> read-file -> system-info without losing per-step detail.

Run a PowerShell command:

```bash
codex-bridge exec lab-win -- "Get-Process | Select-Object -First 5"
```

Run a PowerShell command inside a remote working directory:

```bash
codex-bridge exec --cwd C:\Temp lab-win -- "Get-ChildItem"
```

Run a PowerShell command with a remote timeout:

```bash
codex-bridge exec --timeout-seconds 15 lab-win -- "Get-Date"
```

Read a file:

```bash
codex-bridge read-file lab-win C:\Windows\System32\drivers\etc\hosts
```

Collect structured remote system information:

```bash
codex-bridge system-info lab-win
```

List a directory:

```bash
codex-bridge list-dir lab-win C:\Users\Public
```

Example `list-dir` result shape:

```json
{
  "host": "lab-win",
  "operation": "list-dir",
  "success": true,
  "exit_code": 0,
  "stdout": "raw remote stdout",
  "stderr": "",
  "target": {"path": "C:\\Users\\Public"},
  "data": {
    "path": "C:\\Users\\Public",
    "item_count": 2,
    "entries": [
      {
        "name": "Documents",
        "full_name": "C:\\Users\\Public\\Documents",
        "mode": "d----",
        "is_directory": true,
        "length": null,
        "last_write_time": "2026-03-25T10:00:00+08:00"
      }
    ]
  }
}
```

Write a file:

```bash
codex-bridge write-file lab-win C:\Temp\notes.txt --content "hello from codex-bridge"
```

Search text in one remote file or directory:

```bash
codex-bridge search-text lab-win C:\Logs ERROR --recurse
```

Run a multi-step remote workflow from a local JSON file:

```bash
codex-bridge workflow lab-win --workflow-file .\workflow.json
```

Example `workflow.json`:

```json
[
  {"operation": "search-text", "path": "C:\\Logs", "pattern": "ERROR", "recurse": true},
  {"operation": "read-file", "path": "C:\\Logs\\app.log"},
  {"operation": "system-info"}
]
```

Example `search-text` result shape:

```json
{
  "host": "lab-win",
  "operation": "search-text",
  "success": true,
  "exit_code": 0,
  "stdout": "raw remote stdout",
  "stderr": "",
  "target": {
    "path": "C:\\Logs",
    "pattern": "ERROR",
    "encoding": "utf-8",
    "recurse": true
  },
  "data": {
    "path": "C:\\Logs",
    "is_directory": true,
    "recurse": true,
    "pattern": "ERROR",
    "encoding": "utf-8",
    "file_count": 2,
    "match_count": 1,
    "matches": [
      {
        "path": "C:\\Logs\\app.log",
        "line_number": 12,
        "line": "ERROR failed to connect"
      }
    ]
  }
}
```

## Registry Format

Host profiles live in `data/hosts.json` and follow this shape:

```json
{
  "hosts": [
    {
      "name": "lab-win",
      "platform": "windows",
      "transport": "ssh",
      "hostname": "192.168.1.50",
      "port": 22,
      "username": "admin",
      "auth": {
        "method": "key",
        "key_path": "C:\\Users\\you\\.ssh\\id_ed25519",
        "password": null
      }
    }
  ]
}
```

## Security Notes

- Credentials are never hardcoded in source.
- Password auth can be prompted at command runtime instead of being stored.
- Stored passwords remain plain text in the local JSON registry for this MVP, so use that mode only when acceptable for your environment.
- Unknown SSH host keys are rejected by default through Paramiko's system host key validation.

## Development

Run tests with:

```bash
$env:PYTHONPATH = "src"
python -m unittest discover -s tests
```

Or with pytest in a fresh shell:

```bash
$env:PYTHONPATH = "src"
python -m pytest -q
```

## Next Steps

- add a Linux provider on top of the same SSH transport adapter
- add richer Windows operations such as upload, download, and service control
- support alternate config locations and secret backends
- add Android transport and provider implementations



