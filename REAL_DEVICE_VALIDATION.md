# Real Device Validation

[中文版本](./REAL_DEVICE_VALIDATION.zh-CN.md)

This document answers one question: which paths have actually been proven on real targets, and which ones are still only “supported in code.”

## 1. Validation Logic First

```text
supported in code
  !=
validated on real devices

Only after running on a real target
  ->
keeping evidence
  ->
recording edge cases
  ->
can a path be treated as truly validated
```

## 2. Current Validation Targets

```text
Windows + SSH
  -> validate the real Windows host path

Android + ADB
  -> validate the real Android device path

workflow
  -> validate that a real multi-step flow closes
```

## 3. Windows + SSH Validation

### 3.1 Preconditions

```text
target Windows machine has OpenSSH Server enabled
   |
   +--> current network can reach the host
   +--> at least one SSH account is available
   +--> host key is already trusted locally
   +--> the bridge already has a windows + ssh target
```

### 3.2 Required Checks

```text
probe
exec
exec --cwd
exec --command-file
read-file
list-dir
write-file
search-text
system-info
workflow
```

### 3.3 What Must Be Recorded After Each Round

```text
host name or alias
validation date
commands executed
actual result
unexpected output or edge case
what should happen to the TODO state
```

## 4. Android + ADB Validation

### 4.1 Preconditions

```text
Android platform-tools are installed locally
   |
   +--> adb is available
   +--> adb devices can see the serial
   +--> USB debugging is enabled and authorized
   +--> the bridge already has an android + adb target
```

### 4.2 Required Checks

```text
adb devices
probe
exec
exec --cwd
read-file
list-dir
write-file
search-text
system-info
workflow
```

### 4.3 What Must Be Recorded After Each Round

```text
device model and serial
validation date
connection mode (USB / wireless)
commands executed
actual result
permission or shell limits found
what should happen to the TODO state
```

## 5. Minimum Evidence To Keep

```text
exact host / device profile used
at least one successful JSON sample per operation type
at least one failed JSON sample
one short summary
```

That summary should say:

- what this round proved
- which paths now look stable
- which risks still remain

## 6. What Counts As Truly Done

```text
every required check above
  has been run on a real target
     |
     v
results are usable by CLI and workflow layers
     |
     v
no blocking issue remains undocumented
```

Only then should a path be treated as truly validated, rather than merely “supported in code.”
