# codex-bridge Project Design (v1.1)

[中文版本](./PROJECT_DESIGN.zh-CN.md)

## 1. Project Goal

`codex-bridge` is not meant to analyze remote-machine problems by itself. Its purpose is to act as a bridge that extends the **operating reach of local Codex to remote devices**.

Its core position is:

- **Local Codex thinks, decides, and plans the next step**
- **The bridge sends actions to the right remote execution path and returns results**
- **The remote machine or device performs the actual work**

The current v1.1 direction is:

- keep the first proven path: **Windows + SSH + PowerShell**
- add a second parallel path: **Android + ADB + shell**
- preserve a modular structure so future Linux or alternate transports can be added without rewriting the CLI or service layer

---

## 2. Core Design Idea

This project is not trying to become file sync, remote desktop, or an all-in-one automation platform.

It is trying to solve this problem:

> How can local Codex operate a remote system as if its hands could reach beyond the local computer?

So the core design is:

- **the brain stays local**
- **the action happens remotely**
- **the bridge connects the two**

The bridge should not try to understand tasks first. Its first job is to:

- send commands
- return results
- keep the calling model consistent across platforms

---

## 3. The Core Modules

### Module 1: Local Codex

Responsibilities:

- receive the user task
- decide the next action
- organize multi-step work
- continue based on remote results

Local Codex is the brain. It does not operate remote systems directly; it acts through the bridge.

---

### Module 2: The Bridge (`codex-bridge`)

Responsibilities:

- manage remote host and device definitions
- choose the correct provider/adapter combination
- send local actions into the remote execution layer
- receive remote execution results
- return results in a consistent form

The bridge is not the executor and not the analyst. Its essence is:

> enabling local Codex to operate remote systems in a stable and repeatable way

---

### Module 3: The Remote Execution Side

The remote execution side is platform-specific.

Current supported paths:

- **Windows + PowerShell over SSH**
- **Android shell over ADB**

Responsibilities:

- receive commands through the bridge
- execute them on the remote system
- access remote files, directories, processes, logs, and related resources
- return output, errors, and status

In v1.1, no extra always-running remote agent is deployed.

Reasons:

- PowerShell and Android shell already cover the minimum execution needs
- it keeps remote-side setup simpler
- it validates the provider/adapter architecture faster

If the system grows more advanced later, Module 3 can be upgraded into dedicated remote execution agents.

---

## 4. Design Rule: Platform and Transport Stay Separate

The project should not hardcode one path like `Windows == SSH == PowerShell` into every layer.

Instead:

- **provider** models platform behavior
- **adapter** models connection behavior
- **factory** assembles the right combination from host metadata

That means:

- Windows behavior belongs in `providers/windows.py`
- Android behavior belongs in `providers/android.py`
- SSH behavior belongs in `adapters/ssh.py`
- ADB behavior belongs in `adapters/adb.py`

This separation is what keeps the system extensible.

---

## 5. Required Capabilities

### Priority 1: stable remote execution

- execute remote commands
- return standard output
- return error output
- return execution status

### Priority 2: structured remote inspection

- read remote files
- list remote directories
- write remote files
- search text remotely
- gather system information

### Priority 3: Codex-oriented flow support

- multi-step context
- remote working-directory awareness
- batched actions
- richer structured results
- stronger security controls

---

## 6. What v1.1 Does Not Try to Do

To avoid becoming too heavy too early, v1.1 explicitly does not try to do the following:

- remote desktop
- GUI automation
- deploying an extra remote-side agent
- embedding heavy analysis logic inside the bridge
- turning the bridge into a large general platform too early

The current stage does one thing:

> make local Codex reliably send actions to remote Windows and Android systems through modular execution paths

---

## 7. Current Code Responsibilities

### Startup and command entry

- `__main__.py`: starts the program
- `cli.py`: receives commands and routes requests

### Coordination and data

- `service.py`: coordinates the workflow
- `models.py`: defines host data and result shapes
- `storage.py`: stores and loads host definitions
- `exceptions.py`: expresses errors in a consistent way

### Assembly logic

- `factory.py`: decides which provider/adapter combination to build for a host

### Connection layer

- `adapters/base.py`: shared transport contract
- `adapters/ssh.py`: SSH transport for Windows
- `adapters/adb.py`: ADB transport for Android

### Platform layer

- `providers/base.py`: shared platform contract
- `providers/windows.py`: Windows operations over PowerShell
- `providers/android.py`: Android operations over shell + adb

---

## 8. Typical Data Flow

For a task like inspecting a remote log file, the ideal data flow is:

1. the user gives local Codex a task
2. local Codex decides to inspect a remote path or read a file
3. Codex sends the action through the bridge
4. the bridge resolves the right provider/adapter path
5. the remote execution side performs the action
6. the result comes back to the bridge
7. the bridge returns the result to local Codex
8. Codex decides the next action

The key point is:

- reasoning stays local
- execution happens remotely
- platform/transport switching happens inside the bridge

---

## 9. Current Validation Status

The code now supports two paths in structure:

- Windows + SSH + PowerShell
- Android + ADB + shell

But code support is not the same as real-world proof.

The stage is still incomplete until:

- at least one real Windows host has been validated end to end
- at least one real Android device has been validated end to end
- workflow-based follow-up actions are proven on real targets

---

## 10. Future Expansion Directions

### Platform expansion

- Linux support
- richer Android variants

### Capability expansion

- upload files
- download files
- modify files more safely
- control services
- collect logs

### Execution-model expansion

- persistent context
- action queues
- richer structured results
- stronger security policy and approval controls

### Remote-side expansion

Once PowerShell or adb shell is no longer enough, consider:

- dedicated remote execution agents
- lower repeated connection/startup cost
- more stable long-running remote operation

---

## 11. Definition of Done for This Stage

The current stage is only complete when all of the following are true:

- local setup can define Windows/SSH and Android/ADB targets reliably
- the bridge can choose the correct execution path automatically
- remote targets can execute commands and return structured results
- local Codex can continue based on those results
- real-world validation has been completed on both supported paths

If the code exists but the end-to-end path has not been proven, the stage is not done.

---

## 12. One-Sentence Summary

The real goal of `codex-bridge` v1.1 is:

> **extend the operating reach of local Codex to remote Windows and Android systems through a modular bridge, without coupling platform logic to one transport path.**
