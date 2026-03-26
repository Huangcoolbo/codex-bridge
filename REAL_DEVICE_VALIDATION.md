# Real Device Validation Checklist

[中文版本](./REAL_DEVICE_VALIDATION.zh-CN.md)

This document is for end-to-end validation on real targets. Code-level support is not considered complete until these checks have been run on actual devices.

## 1. Validation Goals

- confirm the Windows + SSH path works on a real Windows host
- confirm the Android + ADB path works on a real Android device
- confirm structured results remain stable on real targets
- confirm `workflow` can chain at least one real multi-step loop

## 2. Windows + SSH Checklist

### Preconditions

- OpenSSH Server is enabled on the target Windows machine
- the machine is reachable from the current network
- one SSH account is available
- host keys are already trusted locally
- the bridge host has a saved `windows + ssh` profile

### Required checks

- `probe`: returns computer name, current user, OS data, PowerShell data
- `exec`: simple command succeeds
- `exec --cwd`: remote working directory is honored
- `exec --command-file`: local script file can be sent and executed
- `read-file`: returns content and metadata
- `list-dir`: returns directory entries with stable structure
- `write-file`: writes content and returns file metadata
- `search-text`: works for one file and one directory tree
- `system-info`: returns structured machine data
- `workflow`: verify `search-text -> read-file -> system-info`
- `workflow`: verify template substitution and failure reporting

### Record after validation

- host name or alias used
- date of validation
- commands executed
- actual result
- unexpected output or edge cases
- whether the TODO state should become `[x]`, stay `[~]`, or move to `[!]`

## 3. Android + ADB Checklist

### Preconditions

- Android platform-tools are installed locally
- `adb` is available in `PATH`
- the Android device is visible in `adb devices`
- USB debugging is enabled and the host is authorized
- the bridge host has a saved `android + adb` profile

### Required checks

- `adb devices`: target serial is visible and authorized
- `probe`: returns model, device, Android version, SDK, serial
- `exec`: simple shell command succeeds
- `exec --cwd`: working directory change works as expected
- `read-file`: read one known text file
- `list-dir`: list one known directory
- `write-file`: write a temporary text file and read it back
- `search-text`: search a known file and one directory tree
- `system-info`: returns manufacturer, model, SDK, serial, ABI
- `workflow`: verify a minimal Android multi-step flow

### Record after validation

- device model and serial used
- date of validation
- connection mode: USB or wireless adb
- commands executed
- actual result
- permission or shell limitations discovered
- whether the TODO state should become `[x]`, stay `[~]`, or move to `[!]`

## 4. Minimum Evidence to Keep

For each real validation round, keep:

- the exact host/device profile used
- one successful JSON result sample per operation
- one failure JSON result sample for at least one operation
- one short summary of what was learned and what still looks risky

## 5. Exit Criteria

A path is considered truly validated only when:

- every required check above has run on a real target
- results are structurally usable by the CLI and workflow layer
- no blocking issue remains undocumented
