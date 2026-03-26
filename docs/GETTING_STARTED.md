# Getting Started

## Who This Is For

If you already understand what `codex-bridge` is and just want the shortest path to running it, start here.

If you still need the product-level overview first, read:
[README.md](/D:/remote-agent-bridge/README.md)

## 1. Install

```bash
python -m venv .venv
. .venv/Scripts/activate
pip install -e .
pip install pytest
```

## 2. Prepare a Target

### Windows

- The remote Windows machine has OpenSSH Server enabled
- You have a login account
- The machine is reachable from your current network

Add a Windows host:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\add-windows-host.ps1 `
  -Name lab-win `
  -HostName 192.168.1.50 `
  -UserName admin `
  -Auth key `
  -KeyPath D:\remote-agent-bridge\data\ssh\localhost_ed25519
```

### Android

- Android platform-tools are installed locally
- The phone has USB debugging or wireless debugging enabled

Use the helper script to check adb, discover devices, and save a target:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-android-device.ps1 `
  -InstallPlatformTools `
  -DeviceName pixel `
  -Probe
```

## 3. Start the Desktop Client

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\launch-bridge-client.ps1
```

When the desktop client starts, it also starts the local agent gateway:

```text
http://127.0.0.1:8765
```

## 4. Smallest Useful Flow

### Check health

```bash
curl http://127.0.0.1:8765/health
```

### List saved targets

```bash
curl http://127.0.0.1:8765/api/targets
```

### Probe a target

```bash
curl -X POST http://127.0.0.1:8765/api/probe \
  -H "Content-Type: application/json" \
  -d '{"target":"localhost"}'
```

### Execute a command

```bash
curl -X POST http://127.0.0.1:8765/api/command/execute \
  -H "Content-Type: application/json" \
  -d '{"target":"localhost","shell":"powershell","command":"Get-Date"}'
```

## 5. Android Gateway

The formal Android HTTP APIs are documented in:
[AGENT_GATEWAY.md](/D:/remote-agent-bridge/AGENT_GATEWAY.md)

Good starting points:

- `GET /api/android/devices`
- `GET /api/android/devices/:serial/info`
- `POST /api/android/devices/:serial/files/list`
- `POST /api/android/devices/:serial/files/read`
- `POST /api/android/devices/:serial/files/mkdir`
- `POST /api/android/devices/:serial/files/write`
- `POST /api/android/devices/:serial/files/push`

## 6. More Documents

- Product overview:
  [README.md](/D:/remote-agent-bridge/README.md)
- Gateway API:
  [AGENT_GATEWAY.md](/D:/remote-agent-bridge/AGENT_GATEWAY.md)
- Project design:
  [PROJECT_DESIGN.md](/D:/remote-agent-bridge/PROJECT_DESIGN.md)
- Real-device status:
  [REAL_DEVICE_VALIDATION.md](/D:/remote-agent-bridge/REAL_DEVICE_VALIDATION.md)
