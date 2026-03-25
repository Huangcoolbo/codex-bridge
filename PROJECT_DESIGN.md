# codex-bridge Project Design (v1)

[中文版本](./PROJECT_DESIGN.zh-CN.md)

## 1. Project Goal

`codex-bridge` is not meant to analyze remote-machine problems by itself. Its purpose is to act as a bridge that extends the **operating reach of local Codex to a remote machine**.

Its core position is:

- **Local Codex thinks, decides, and plans the next step**
- **The bridge sends actions to the remote machine and returns execution results**
- **The remote machine performs the actual work**

The first stage focuses on:

- local Codex operating a remote Windows machine through the bridge
- remote Windows using PowerShell as the execution layer
- later expansion toward Linux and Android

---

## 2. Core Design Idea

This project is not trying to become file sync or remote desktop.

It is trying to solve this problem:

> How can local Codex operate a remote machine as if its hands could reach beyond the local computer?

So the core design is:

- **the brain stays local**
- **the action happens remotely**
- **the bridge connects the two**

The bridge should not try to understand tasks first. Its first job is to:

- send commands
- return results
- keep the calling model consistent

---

## 3. The Three Core Modules

### Module 1: Local Codex

Responsibilities:

- receive the user task
- decide the next action
- organize multi-step work
- continue based on remote results

Local Codex is the brain. It does not operate the remote system directly; it acts through the bridge.

---

### Module 2: The Bridge (`remote-agent-bridge`)

Responsibilities:

- manage remote host definitions
- establish the connection path from local to remote
- send local actions into the remote execution layer
- receive remote execution results
- return results in a consistent form

The bridge is not the executor and not the analyst. Its essence is:

> enabling local Codex to operate a remote machine in a stable and repeatable way

---

### Module 3: The Remote Execution Side

In the first stage, the remote execution side is simply:

- **remote Windows PowerShell**

Responsibilities:

- receive commands through the bridge
- execute them on the remote machine
- access remote files, directories, processes, services, and related resources
- return output, errors, and status

In v1, no extra always-running remote agent is deployed.

Reasons:

- PowerShell already covers the minimum execution needs
- it keeps remote-side setup simpler
- it is the fastest way to validate the full architecture

If the system grows more advanced later, Module 3 can be upgraded into a dedicated remote execution agent.

---

## 4. First-Stage Required Capabilities

The first stage must focus on basic remote execution actions.

### Priority 1

- execute remote PowerShell commands
- return standard output
- return error output
- return execution status

### Priority 2

After Priority 1 is stable:

- read remote files
- list remote directories
- write remote files
- search text remotely
- gather system information

### Priority 3

After the above is stable:

- multi-step context
- remote working-directory awareness
- batched actions
- richer structured results
- stronger security controls

---

## 5. What v1 Does Not Try to Do

To avoid becoming too heavy too early, v1 explicitly does not try to do the following:

- remote desktop
- GUI automation
- deploying an extra remote-side agent
- embedding heavy analysis logic inside the bridge
- becoming an all-in-one platform too early

The first stage does one thing:

> make local Codex reliably send actions to remote Windows

---

## 6. Current Code Responsibilities

### Startup and command entry

- `__main__.py`: starts the program
- `cli.py`: receives commands and routes requests

### Coordination and data

- `service.py`: coordinates the workflow
- `models.py`: defines host data and result shapes
- `storage.py`: stores and loads host definitions
- `exceptions.py`: expresses errors in a consistent way

### Assembly logic

- `factory.py`: decides which execution combination to build for a host

### Connection layer

- `adapters/base.py`: shared connection contract
- `adapters/ssh.py`: builds the remote SSH path to Windows

### Platform layer

- `providers/base.py`: shared platform contract
- `providers/windows.py`: turns Windows operations into concrete executable actions

---

## 7. A Typical Data Flow

For a task like inspecting a remote `OpenClaw.json`, the ideal data flow is:

1. the user gives local Codex a task
2. local Codex decides to inspect a remote path or read a file
3. Codex sends the action through the bridge
4. the bridge sends the action over the connection layer to remote Windows
5. remote PowerShell performs the action
6. the result comes back to the bridge
7. the bridge returns the result to local Codex
8. Codex decides the next action

The key point is:

- reasoning stays local
- execution happens remotely
- the bridge handles the connection and handoff

---

## 8. Why PowerShell Is the First Execution Layer

Remote PowerShell is the best v1 execution layer because:

- it is native to Windows
- it already covers the first-stage actions
- it can work with files, directories, processes, services, and system state
- it avoids deploying a new always-running program on the remote machine
- it is the fastest route to validating the “Codex breaks out of the local machine” concept

So in v1:

> Module 3 can be treated as the remote PowerShell execution layer.

Strictly speaking, it is not a newly built separate service yet. It is the remote system’s built-in execution capability used as the third module.

---

## 9. Future Expansion Directions

After v1 is proven, the project can grow in several directions.

### Platform expansion

- Linux support
- Android support

### Capability expansion

- upload files
- download files
- modify files
- control services
- collect logs

### Execution-model expansion

- persistent context
- action queues
- richer structured results
- stronger security policy and approval controls

### Remote-side expansion

Once PowerShell is no longer enough, consider:

- a dedicated remote execution agent
- lower repeated connection/startup cost
- more stable long-running remote operation

---

## 10. First-Stage Definition of Done

The first stage is only complete when all of the following are true:

- local setup can define remote Windows hosts reliably
- the bridge can send commands from local to remote Windows
- remote Windows can execute commands and return results
- local Codex can continue based on those results
- at least one full real-world remote validation has been completed

If the code exists but the end-to-end path has not been proven, the stage is not done.

---

## 11. One-Sentence Summary

The real goal of `remote-agent-bridge` v1 is:

> **extend the operating reach of local Codex to remote Windows through a bridge, using remote PowerShell as the first execution layer.**
