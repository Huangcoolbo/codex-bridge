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

Add a Windows host using key auth:

```bash
remote-agent-bridge host add lab-win ^
  --hostname 192.168.1.50 ^
  --username admin ^
  --auth key ^
  --key-path C:\Users\you\.ssh\id_ed25519
```

Add a host using password auth but prompt at runtime instead of storing the password:

```bash
remote-agent-bridge host add lab-win-password ^
  --hostname 192.168.1.51 ^
  --username admin ^
  --auth password
```

Store a password in the local project registry only if you explicitly choose to:

```bash
remote-agent-bridge host add lab-win-stored ^
  --hostname 192.168.1.52 ^
  --username admin ^
  --auth password ^
  --store-password
```

List registered hosts:

```bash
remote-agent-bridge host list
```

Probe a host:

```bash
remote-agent-bridge probe lab-win
```

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

