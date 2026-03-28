<div align="center">
  <img src="./docs/assets/mengo.png" alt="Codex.Bridge icon" width="72" />
  <h1>Codex.Bridge</h1>

  <p>
    <a href="./docs/GETTING_STARTED.md">Getting Started</a> ·
    <a href="./AGENT_GATEWAY.md">Gateway API</a> ·
    <a href="./PROJECT_DESIGN.md">Project Design</a> ·
    <a href="./docs/DEVELOPMENT.md">Development</a> ·
    <a href="./REAL_DEVICE_VALIDATION.md">Real Device Validation</a> ·
    <a href="./CHANGELOG.md">CHANGELOG</a>
  </p>

  <p><a href="./README.md">中文首页</a></p>

  <p>
    <a href="./AGENT_GATEWAY.md"><img src="https://img.shields.io/badge/platform-Windows%20%2B%20Android-16A34A" alt="Platform" /></a>
    <a href="./desktop-client"><img src="https://img.shields.io/badge/client-Electron%20%2B%20React-111827" alt="Desktop" /></a>
    <a href="./AGENT_GATEWAY.md"><img src="https://img.shields.io/badge/gateway-Local%20HTTP%20API-0F766E" alt="Gateway" /></a>
    <a href="./docs/GETTING_STARTED.md"><img src="https://img.shields.io/badge/docs-Getting%20Started-2563EB" alt="Docs" /></a>
    <a href="https://github.com/Huangcoolbo/codex-bridge/stargazers"><img src="https://img.shields.io/github/stars/Huangcoolbo/codex-bridge?style=flat" alt="GitHub stars" /></a>
    <a href="https://github.com/Huangcoolbo/codex-bridge/network/members"><img src="https://img.shields.io/github/forks/Huangcoolbo/codex-bridge?style=flat" alt="GitHub forks" /></a>
  </p>
</div>

> Make Codex perform real remote work on Windows and Android instead of only printing commands.

## 1. What This Is

`Codex.Bridge` is a local execution gateway for Codex / agents.

It is not a remote desktop product, not just a thin SSH/ADB wrapper, and not only a manual control panel. Its job is different:

```text
User asks for an outcome
   |
   v
Codex decides what should happen
   |
   v
Codex.Bridge connects, probes, reads, executes, and writes
   |
   v
Windows / Android return real results
```

It brings these pieces into one product surface:

- Windows: SSH + PowerShell
- Android: ADB + controlled APIs
- Electron desktop client
- local HTTP gateway

## 2. What You Get When You Launch It

Once it starts, you get two things at the same time:

```text
┌──────────────────────┐
│ Desktop Client       │  for human setup, debugging, and result review
└──────────────────────┘

┌──────────────────────┐
│ Local HTTP Gateway   │  for Codex / agent calls
│ http://127.0.0.1:8765│
└──────────────────────┘
```

Both use the same underlying execution path, so:

- what a human clicks in the client, and
- what Codex calls through the gateway

ultimately go through the same bridge logic.

## 3. What Problem It Solves

Without a bridge like this, “AI should help me operate remote systems” often collapses into a manual loop:

```text
switch SSH
  -> copy command
  -> paste result
  -> switch adb
  -> copy paths
  -> paste output back to AI
```

`Codex.Bridge` turns that into a stable product path:

- targets are registered once
- operations are exposed formally
- results come back in a structured shape
- Android writes are opened gradually behind explicit boundaries
- human UI and agent calls stop drifting into two different worlds

## 4. Shortest Useful Path

Start the client:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\launch-bridge-client.ps1
```

Then use the shortest useful flow:

```text
Start the client
   |
   v
Save a Windows host or Android device
   |
   v
Let Codex call probe / execute / files through the local gateway
   |
   v
Read state, output, and results in the desktop client
```

If you want the exact install and startup steps, go to:
[Getting Started](./docs/GETTING_STARTED.md)

## 5. What You See In The Client

The client is meant to feel like a desktop workbench, not a generic admin form.

```text
┌───────────────┬──────────────────────────┬──────────────────┐
│ Left rail      │ Middle work area          │ Right panel        │
├───────────────┼──────────────────────────┼──────────────────┤
│ Overview       │ discover hosts            │ current target     │
│ Android        │ edit connection details   │ output and result  │
│ Windows / Linux│ probe / execute / files   │                    │
└───────────────┴──────────────────────────┴──────────────────┘
```

The current main path is:

```text
discover target
  -> probe
  -> save after success
  -> execute commands or file actions
  -> inspect output
```

## 6. What It Can Do Today

### Windows

- save targets
- probe connectivity
- execute PowerShell
- return `stdout / stderr / exit_code`

### Android

- list devices
- read device info
- list directories
- read files
- create directories
- write text files
- push local files

### Gateway

- list targets
- set current target / current Android device
- probe
- execute
- read the last result

## 7. Typical Scenarios

### Scenario 1: Inspect a Windows machine

```text
User: find out why this Windows machine is failing
   |
   v
Codex selects a target
   |
   v
probe
   |
   v
execute PowerShell
   |
   v
return stdout / stderr / exit_code
```

### Scenario 2: Read files from an Android device

```text
User: show me what is in my phone's Download folder
   |
   v
Codex lists devices
   |
   v
reads device info
   |
   v
lists the directory / reads files
```

### Scenario 3: Perform controlled Android writes

```text
User: create a workspace in Documents on my phone and write a note
   |
   v
Codex calls files/mkdir
   |
   v
Codex calls files/write or files/push
   |
   v
write stays inside controlled allowlisted paths
```

## 8. Technical Shape

```text
User
  |
  v
Codex
  |
  v
Codex.Bridge Desktop Client
  |
  +--> Renderer (human UI)
  |
  +--> Electron Main
         |
         +--> Local HTTP Gateway
         |      |
         |      +--> target management
         |      +--> probe / execute
         |      +--> Android controlled APIs
         |
         +--> Service layer
                |
                +--> Windows bridge -> SSH -> PowerShell
                |
                +--> Android bridge -> ADB -> controlled file/device actions
```

For the full architecture snapshot, go to:
[Project Design](./PROJECT_DESIGN.md)

## 9. Why It Is Better Than Manual SSH / ADB

Its value is not “one more wrapper.” Its value is that the calling model is cleaned up:

- Codex gets formal interfaces instead of “run this in a terminal”
- targets, state, and results live inside one consistent model
- human UI and agent automation share the same foundation
- Android write capability is gated behind explicit boundaries
- the structure already leaves room for Linux later

## 10. Which Document To Read Next

```text
if you want to run it quickly
  -> docs/GETTING_STARTED.md

if you want to integrate Codex / agent calls
  -> AGENT_GATEWAY.md

if you want to really understand the architecture
  -> PROJECT_DESIGN.md

if you want to extend the project
  -> docs/DEVELOPMENT.md

if you want to see real-device validation status
  -> REAL_DEVICE_VALIDATION.md
```

## 11. Current Status

This repository is already beyond concept-demo level:

- the localhost Windows SSH path is working
- the Android USB debugging path is working
- the Android gateway already supports read APIs plus the first controlled write APIs
- the desktop client and HTTP gateway share the same underlying execution logic
- the desktop client already supports installer builds, update checks, and installer handoff

## 12. What Comes Next

```text
Android files/delete
Android input tap / input text
Linux path
stronger safety controls
stronger session controls
```
