# Development Notes

This document is for people extending the project.

If you want the product view first, start with:
[README.en.md](../README.en.md)

## 1. Current Code Shape

```text
desktop-client/
  ├─ src/renderer/   UI and interaction
  ├─ src/preload/    narrow bridge between renderer and main
  ├─ src/main/       Electron main, gateway, update, tray, startup
  └─ release/        packaged artifacts

src/remote_agent_bridge/
  ├─ service.py      bridge entry
  ├─ factory.py      provider / adapter assembly
  ├─ adapters/       SSH / ADB
  └─ providers/      Windows / Android

scripts/
  ├─ launch-bridge-client.ps1
  ├─ bootstrap-client-runtime.ps1
  └─ authorize-managed-ssh-key.ps1
```

## 2. Current Layer Split

```text
Renderer
  -> human UI

Preload
  -> controlled API surface for renderer

Electron Main
  -> IPC, HTTP gateway, update, tray, startup

Service Layer
  -> target management, probe, execute, Android gateway

Python Bridge
  -> real SSH / ADB execution path
```

For the full architecture snapshot, see:
[PROJECT_DESIGN.md](../PROJECT_DESIGN.md)

## 3. Main Runtime Paths

### 3.1 Desktop Client Path

```text
Renderer
  -> Preload
  -> Electron Main
  -> bridgeService / automationService / androidGatewayService
  -> Python bridge or ADB service
  -> remote target
```

### 3.2 Agent Gateway Path

```text
Codex / external caller
  -> Local HTTP Gateway
  -> Electron Main services
  -> Python bridge / Android gateway
  -> Windows / Android
```

## 4. Directories You Will Use Most

- Python bridge:
  [src/remote_agent_bridge](../src/remote_agent_bridge)
- Electron client:
  [desktop-client](../desktop-client)
- Gateway docs:
  [AGENT_GATEWAY.md](../AGENT_GATEWAY.md)
- Project design:
  [PROJECT_DESIGN.md](../PROJECT_DESIGN.md)

## 5. Current Core Capabilities

```text
Windows
  -> SSH + PowerShell

Android
  -> ADB + controlled APIs

Desktop
  -> Electron client

Gateway
  -> local HTTP API for Codex / agents
```

## 6. Validation And Build

### 6.1 Python

```bash
python -m pytest -q
```

### 6.2 Desktop Client

```powershell
cd .\desktop-client
npm run typecheck
node --test --experimental-strip-types .\tests\androidGatewayService.test.ts
npm run build
```

To build the Windows installer:

```powershell
cd .\desktop-client
npm run dist:win
```

## 7. Status Files Worth Watching

```text
data/hosts.json
  -> saved targets

CHANGELOG.md
  -> version history

REAL_DEVICE_VALIDATION.md
  -> real-device validation status
```

## 8. Suggested Reading Order

```text
start with README
  -> understand the product

then GETTING_STARTED
  -> understand the shortest working path

then AGENT_GATEWAY
  -> understand the formal API surface

then PROJECT_DESIGN
  -> understand layers, data flow, and design choices

then REAL_DEVICE_VALIDATION
  -> understand what has been proven on real targets
```
