# remote-agent-bridge

[中文说明](./README.zh-CN.md) | [English](./README.md)

`remote-agent-bridge` is a Python MVP for remote machine control with a clean separation between:

- providers, which model platform behavior such as Windows filesystem and PowerShell commands
- adapters, which model transport behavior such as SSH

The first concrete implementation is Windows over OpenSSH. The structure is intended to support future Linux and Android providers without rewriting the CLI or host registry layers.

## Features

- host profile registry stored locally in `data/hosts.json`
- provider/adapter architecture with a Windows provider over an SSH transport
- CLI commands for `host add`, `host list`, `probe`, `exec`, `read-file`, and `list-dir`
- password or key-based SSH auth in the host schema
- runtime password prompting when the profile omits a stored password
- basic tests for storage and Windows provider behavior

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
```

## Quick Start

Use the ready-made PowerShell scripts for common tasks.

Current helper scripts:

- `scripts/init.ps1`
- `scripts/add-windows-host.ps1`
- `scripts/list-hosts.ps1`
- `scripts/probe-host.ps1`
- `scripts/exec-remote.ps1`
- `scripts/read-remote-file.ps1`
- `scripts/list-remote-dir.ps1`
- `scripts/write-remote-file.ps1`

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

Run a PowerShell command:

```bash
remote-agent-bridge exec lab-win -- "Get-Process | Select-Object -First 5"
```

Read a file:

```bash
remote-agent-bridge read-file lab-win C:\Windows\System32\drivers\etc\hosts
```

List a directory:

```bash
remote-agent-bridge list-dir lab-win C:\Users\Public
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

## Next Steps

- add a Linux provider on top of the same SSH transport adapter
- add richer Windows operations such as upload, download, and service control
- support alternate config locations and secret backends
- add Android transport and provider implementations

