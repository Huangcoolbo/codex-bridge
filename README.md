# codex-bridge

[中文说明](./README.zh-CN.md)

> Make Codex do real remote work on Windows and Android instead of only suggesting commands.

## ✨ What This Is

`codex-bridge` is a local execution gateway for Codex / agents.

It brings these pieces together into one product surface:

- Windows: SSH + PowerShell
- Android: ADB + controlled APIs
- Electron desktop client
- local HTTP gateway

It is not a remote desktop tool, and it is not just a thin SSH/ADB wrapper.  
The split is simple:

- the user asks for an outcome
- Codex decides what to do
- `codex-bridge` sends that action to the right remote path

## 🤔 What Problem It Solves

Without a bridge like this, many “AI should help me operate a remote system” workflows collapse into:

- manually switching between SSH and adb
- copying commands in and pasting results back out
- AI giving advice without a stable way to execute it
- scripts and one-off commands scattered across local machines

`codex-bridge` fixes that by:

- registering targets once
- exposing formal operations through a local gateway
- returning structured results
- opening Android writes gradually through controlled APIs instead of raw unrestricted shell

## 👤 Who It Is For

- people who want Codex to actually operate remote devices
- people who work with both Windows and Android targets
- people who do not want their workflow split across terminals, shell history, SSH, and adb
- people who want a local gateway now and room to grow into Linux later

## 🧠 What Codex Does Here

The responsibility split is:

- Codex thinks
- `codex-bridge` connects and executes
- remote devices return real results

A simple mental model:

- Codex is the brain
- `codex-bridge` is the arm
- Windows / Android are the real systems being operated

## 🚀 How a User Uses It

The shortest useful flow is only 3 steps:

1. Start the desktop client
2. Save a Windows host or Android device
3. Let Codex probe, read, execute, or write through the local gateway

That means the user no longer needs to:

- manually switch SSH sessions
- type raw adb shell commands
- copy paths around by hand
- paste stdout/stderr back to Codex every time

### Start the client first

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\launch-bridge-client.ps1
```

Once it starts, you get two things:

- a desktop client for human target setup and debugging
- a local gateway for Codex / agents at `http://127.0.0.1:8765`

If you just want the shortest path, keep reading here.  
If you want the full install and startup flow, go to:
[docs/GETTING_STARTED.md](/D:/remote-agent-bridge/docs/GETTING_STARTED.md)

## 📦 What It Can Do Today

### Windows

- save targets
- probe connectivity
- execute PowerShell
- return structured results

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
- manage current target / current Android device
- probe
- execute
- read the last result

## 🧪 Typical Scenarios

### 1. Inspect a Windows machine

The user says:
“Find out why this Windows machine is failing.”

Codex can:

- select a target
- probe connectivity
- execute PowerShell
- read `stdout / stderr / exit_code`

### 2. Read files from an Android device

The user says:
“Show me what is in my phone’s Download folder.”

Codex can:

- list devices
- inspect device info
- list a directory
- read files

### 3. Perform controlled Android writes

The user says:
“Create a workspace in Documents on my phone and write a note into it.”

Codex can already call:

- `files/mkdir`
- `files/write`
- `files/push`

Those writes are controlled product APIs, not unrestricted raw shell.

## 🏗️ Architecture

```text
User
  |
  v
Codex
  |
  v
codex-bridge Desktop Client
  |
  +--> Renderer (human UI)
  |
  +--> Electron Main
         |
         +--> Local HTTP Gateway
         |      |
         |      +--> Target management
         |      +--> Probe / Execute
         |      +--> Android controlled APIs
         |
         +--> Service layer
                |
                +--> Windows bridge -> SSH -> PowerShell
                |
                +--> Android bridge -> ADB -> controlled file/device actions
```

## 🔌 Why It Is Better Than Manual SSH / ADB

- it gives Codex formal interfaces instead of “please run this in a terminal”
- it turns targets, state, and results into one consistent model
- it supports both human UI debugging and agent-driven automation
- it keeps Android write capabilities behind explicit boundaries
- it is already shaped to grow into Linux support

## 📚 Docs

- Getting started:
  [docs/GETTING_STARTED.md](/D:/remote-agent-bridge/docs/GETTING_STARTED.md)
- Gateway API:
  [AGENT_GATEWAY.md](/D:/remote-agent-bridge/AGENT_GATEWAY.md)
- Project design:
  [PROJECT_DESIGN.md](/D:/remote-agent-bridge/PROJECT_DESIGN.md)
- Development notes:
  [docs/DEVELOPMENT.md](/D:/remote-agent-bridge/docs/DEVELOPMENT.md)
- Real-device status:
  [REAL_DEVICE_VALIDATION.md](/D:/remote-agent-bridge/REAL_DEVICE_VALIDATION.md)

## 📍 Current Status

This repository is already beyond a pure concept demo:

- the localhost Windows SSH path is working
- the Android USB debugging path is working on a real device
- the Android gateway already supports read APIs plus the first controlled write APIs
- the Electron client and HTTP gateway share the same underlying logic

## 🛣️ Next

- Android `files/delete`
- Android `input tap / input text`
- Linux support
- stronger safety and session controls
