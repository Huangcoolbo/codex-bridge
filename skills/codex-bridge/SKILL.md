---
name: codex-bridge
description: Use when creating, revising, or extending a Codex.Bridge-style project: an agent-first, gateway-first system bridge that exposes real provider-backed system capabilities instead of a UI-first local demo. Require at least one real remote/device path such as Windows SSH + PowerShell or Android ADB-backed access. Prefer structured gateway actions, explicit state/probe/result handling, and controlled write capability that exists in the architecture even when disabled or policy-guarded by default.
---

# Codex Bridge

## Intent

Use this skill when the goal is to build or revise a real `codex-bridge` project.

The project should default to this model:

```text
Agent
  ->
Gateway
  ->
real provider-backed bridge path
  ->
remote host or device
```

Do not treat the desktop client or human UI as the core product abstraction.

The primary artifact should be:

- agent-first
- gateway-first
- provider-backed
- state-aware
- safe enough to run in continuous tasks

## What This Skill Should Produce

A valid `codex-bridge` project is not just "a local web server with a few endpoints".

It must behave like a bridge:

```text
structured gateway request
  ->
bridge/service layer
  ->
real transport/provider
  ->
real target
  ->
structured result
```

The result should be a real system-capability bridge, not a local-only demo.

## Non-Goals

Do not stop at any of these:

- a local mock gateway with no real provider behind it
- a desktop client whose gateway is secondary or optional afterthought plumbing
- a gateway that only shells locally and calls that "remote execution"
- a project that only lists or reads state but cannot represent controlled write capability
- a project that has endpoint names and JSON shapes but no real transport-backed path
- a project whose main value is UI polish rather than stable agent execution

## Minimal Runnable Form

A minimal runnable implementation must include all of the following:

```text
1. a running gateway
2. at least one real provider-backed execution path
3. structured success / failure results
4. explicit state inspection before larger actions
5. at least one controlled mutation path in the architecture
```

### Acceptable Real Provider-Backed Minimal Paths

At least one of these must exist end-to-end:

#### Option A: Windows

```text
gateway
  ->
Windows provider
  ->
SSH transport
  ->
remote Windows host
  ->
PowerShell execution
```

Minimum useful capabilities:

- target selection or equivalent host context
- probe
- real PowerShell execution through SSH
- structured stdout / stderr / exit status

#### Option B: Android

```text
gateway
  ->
Android provider
  ->
ADB
  ->
real Android device
```

Minimum useful capabilities:

- device discovery
- at least one real file read path
- at least one controlled mutation path in architecture

Examples of acceptable controlled mutation paths:

- mkdir
- write text
- push file

The mutation path may be:

- disabled by default
- policy-guarded
- narrowly scoped

But it must exist as a real architectural path, not as a TODO.

## What Counts As Incomplete

Treat the implementation as incomplete if any of these are true:

- the gateway only talks to local placeholder code
- the "remote" path does not cross a real SSH or ADB boundary
- the system only supports read-like endpoints and lacks controlled mutation in the architecture
- execution is limited to a trivial demo path with no real provider abstraction
- the project can run locally but cannot actually probe or act on a real remote host or device
- the project only implements generic JSON routes without a real bridge workflow
- the project requires the UI to be the primary operating surface

A local-only placeholder gateway is explicitly incomplete.

## Core Build Rule

When generating the project, think in this order:

```text
real path first
  ->
gateway shape second
  ->
optional client last
```

Do not start from the desktop client.

Start from:

- the provider-backed bridge path
- the gateway actions that expose it
- the state model needed to keep multi-step tasks reliable

## Architecture Rule

Prefer this mental model:

```text
Agent
  ->
Gateway
  ->
Service / bridge layer
  ->
Provider / transport
  ->
Target
```

The exact directory structure may vary.

Do not force a rigid folder layout.

But preserve these separations:

- gateway-facing request handling
- bridge/service orchestration
- provider/transport execution
- result normalization

The UI, if present, should sit beside this path, not above it.

## Gateway-First Rule

The gateway is the primary interface.

The gateway should be able to drive:

- target or device selection
- probe or discovery
- read actions
- execution actions
- controlled write actions
- status/result inspection

The client, if present, should reuse the same underlying bridge path rather than invent a second logic tree.

## Controlled Write Rule

Controlled write capability must be part of the architecture.

Do not treat write support as optional future work if the project claims to be a bridge for continuous tasks.

Acceptable forms:

```text
write path exists
  ->
disabled by default

write path exists
  ->
allowlisted

write path exists
  ->
restricted to low-risk locations or operations
```

Unacceptable form:

```text
"read now, maybe write later"
```

if nothing in the current architecture can perform a real controlled mutation.

## Implementation Preferences

Prefer these implementation traits:

- structured results over raw text-only returns
- explicit `probe` or `discover` before larger actions
- explicit current target/device state when the flow depends on continuity
- provider-backed actions over placeholder handlers
- narrow, controlled mutations over broad unrestricted shell access
- policy surfaces that can disable risky actions without removing the architecture

Avoid over-specifying:

- exact route names
- exact folder names
- exact class names
- one rigid implementation language pattern

The important part is the execution shape, not the cosmetic structure.

## Creation Workflow

When creating a new project, use this sequence:

```text
1. choose one real provider-backed path
2. make that path truly runnable end-to-end
3. expose the smallest gateway surface that proves the path is real
4. add structured result handling
5. add one controlled mutation path
6. only then add convenience layers
```

If the project supports more than one platform later, that is expansion.

Do not weaken the first real path in order to sketch two fake ones.

## Recovery Rules

If the task becomes too broad or unstable, recover like this:

### If both Windows and Android are requested at once

Finish one provider-backed path first.

Prefer depth over breadth.

### If the environment blocks one path

Switch to the other real path if possible.

Do not replace the blocked path with a mock and call the project complete.

### If controlled write feels too risky

Keep the path narrow and guarded.

Do not delete the capability from the architecture.

### If a desktop client already exists

Keep it optional.

Do not let it become the primary reasoning surface for the bridge.

## Stop Conditions

The project is allowed to stop at a minimal stage only when all of these are true:

- the gateway runs
- at least one provider-backed path is real and usable
- probe/discovery exists for that path
- execution or device access is real for that path
- structured result handling exists
- controlled write exists in architecture

Do not stop at:

- "server starts"
- "routes return JSON"
- "demo local execution works"
- "read endpoints work but writes are still future work"

## Validation Rule

Before declaring the project minimally complete, confirm:

```text
gateway up
  ->
real target reachable
  ->
probe/discover works
  ->
read path works
  ->
execute or controlled mutation path works
  ->
result structure is honest about success and failure
```

If the project cannot prove a real provider-backed path, treat it as incomplete.

## Status Interpretation Rule

Always interpret bridge results structurally.

Use at least:

```text
success flag
  +
exit code or equivalent process/device result
  +
stdout / stderr or equivalent evidence
```

Do not mark an action successful just because a wrapper returned a nominal success field.

## Output Style When Using This Skill

When planning or generating the project, explain it like this:

```text
chosen real path
  ->
minimum gateway actions
  ->
bridge/provider flow
  ->
controlled write stance
  ->
what still counts as incomplete
```

Keep explanations short and operational.

At first read, an agent should quickly understand:

- what the project is
- what does not count
- what minimal completion requires
- what to build first
