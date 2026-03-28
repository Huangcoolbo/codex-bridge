# Getting Started

If you already know what `Codex.Bridge` is and only want the shortest path to a working setup, start here.

If you still need the product overview first, read:
[README.en.md](../README.en.md)

## 1. Start With The Overall Flow

```text
prepare local environment
   |
   v
prepare at least one remote target
   |
   v
start the desktop client
   |
   v
confirm the local gateway is online
   |
   v
run probe / execute
```

## 2. Prepare The Local Environment

Run in the project root:

```bash
python -m venv .venv
. .venv/Scripts/activate
pip install -e .
pip install pytest
```

If your goal is simply to launch the desktop client, you can also start with:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\launch-bridge-client.ps1
```

That script launches the desktop client and prepares the local runtime.

## 3. Prepare A Target

### 3.1 Windows

Preconditions:

```text
target Windows machine has OpenSSH Server enabled
   |
   +--> you have a login account
   +--> the host is reachable from your machine
   +--> you already have a password or private key
```

Add a Windows host:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\add-windows-host.ps1 `
  -Name lab-win `
  -HostName 192.168.1.50 `
  -UserName admin `
  -Auth key `
  -KeyPath D:\remote-agent-bridge\data\ssh\localhost_ed25519
```

### 3.2 Android

Preconditions:

```text
Android platform-tools are installed locally
   |
   +--> the phone has USB or wireless debugging enabled
   +--> adb can see the device
```

Use the helper script to check `adb`, discover devices, and save a target:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-android-device.ps1 `
  -InstallPlatformTools `
  -DeviceName pixel `
  -Probe
```

## 4. Start The Desktop Client

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\launch-bridge-client.ps1
```

When it starts, it also brings up:

```text
desktop client
   +
local agent gateway
   |
   v
http://127.0.0.1:8765
```

## 5. Run The Smallest Useful Validation

### 5.1 Check health

```bash
curl http://127.0.0.1:8765/health
```

### 5.2 List saved targets

```bash
curl http://127.0.0.1:8765/api/targets
```

### 5.3 Probe a target

```bash
curl -X POST http://127.0.0.1:8765/api/probe \
  -H "Content-Type: application/json" \
  -d '{"target":"localhost"}'
```

### 5.4 Execute a command

```bash
curl -X POST http://127.0.0.1:8765/api/command/execute \
  -H "Content-Type: application/json" \
  -d '{"target":"localhost","shell":"powershell","command":"Get-Date"}'
```

## 6. Android Starting Points

The formal Android HTTP APIs are documented in:
[AGENT_GATEWAY.md](../AGENT_GATEWAY.md)

Common entry points:

```text
GET  /api/android/devices
GET  /api/android/devices/:serial/info
POST /api/android/devices/:serial/files/list
POST /api/android/devices/:serial/files/read
POST /api/android/devices/:serial/files/mkdir
POST /api/android/devices/:serial/files/write
POST /api/android/devices/:serial/files/push
```

## 7. Where To Look Next

```text
if the client does not start cleanly
  -> docs/DEVELOPMENT.md

if you need endpoint details
  -> AGENT_GATEWAY.md

if you need the architecture
  -> PROJECT_DESIGN.md

if you need real-device status
  -> REAL_DEVICE_VALIDATION.md
```
