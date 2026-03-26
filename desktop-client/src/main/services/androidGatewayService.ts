import { execFile } from "node:child_process"
import { existsSync, lstatSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { basename, join, posix, resolve } from "node:path"
import { tmpdir } from "node:os"
import { randomUUID } from "node:crypto"

import { discoverAndroid, resolveAdbPath } from "./androidService"
import {
  type AndroidTextWriteMode,
  validateAndroidMkdirRequest,
  validateAndroidPushRequest,
  validateAndroidTextWriteRequest
} from "./androidGatewayPolicy"
import { clearCurrentAndroidDevice, getCurrentAndroidDevice, setCurrentAndroidDevice } from "./sessionService"

const desktopClientRoot = process.cwd()
const projectRoot = resolve(desktopClientRoot, "..")
const defaultPullRoot = join(projectRoot, "data", "android-pulls")

type AndroidGatewayEnvelope = {
  success: boolean
  stdout: string
  stderr: string
  exit_code: number
  data: Record<string, unknown> | null
}

const safeGetpropKeys = new Set([
  "ro.product.model",
  "ro.product.device",
  "ro.product.manufacturer",
  "ro.product.brand",
  "ro.build.version.release",
  "ro.build.version.sdk",
  "ro.build.fingerprint",
  "ro.serialno",
  "ro.product.cpu.abi"
])

function shLiteral(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function invalidEnvelope(message: string): AndroidGatewayEnvelope {
  return {
    success: false,
    stdout: "",
    stderr: message,
    exit_code: 1,
    data: null
  }
}

function runAdb(adbPath: string, args: string[], input?: string): Promise<AndroidGatewayEnvelope> {
  return new Promise((resolvePromise, reject) => {
    const child = execFile(adbPath, args, { windowsHide: true }, (error, stdout, stderr) => {
      if (error && typeof error.code !== "number") {
        reject(error)
        return
      }
      const exitCode = typeof error?.code === "number" ? error.code : 0
      resolvePromise({
        success: exitCode === 0,
        stdout,
        stderr,
        exit_code: exitCode,
        data: null
      })
    })

    if (input !== undefined) {
      child.stdin?.write(input)
      child.stdin?.end()
    }
  })
}

function withSerialData(envelope: AndroidGatewayEnvelope, serial: string, data: Record<string, unknown>): AndroidGatewayEnvelope {
  return {
    ...envelope,
    data: {
      serial,
      ...data
    }
  }
}

function successEnvelope(data: Record<string, unknown>, stdout = "", stderr = ""): AndroidGatewayEnvelope {
  return {
    success: true,
    stdout,
    stderr,
    exit_code: 0,
    data
  }
}

async function runSerialShell(serial: string, args: string[]): Promise<AndroidGatewayEnvelope> {
  const adbPath = resolveAdbPath()
  return runAdb(adbPath, ["-s", serial, ...args])
}

async function runShellScript(serial: string, script: string): Promise<AndroidGatewayEnvelope> {
  const adbPath = resolveAdbPath()
  const normalizedScript = script.endsWith("\n") ? script : `${script}\n`
  return runAdb(adbPath, ["-s", serial, "shell", "sh"], normalizedScript)
}

function validateSafeShell(command: string): { kind: "getprop", key: string } | { kind: "id" | "id-u" | "id-un" | "pwd" } | { kind: "invalid", message: string } {
  const trimmed = command.trim()
  if (!trimmed) {
    return { kind: "invalid", message: "command is required" }
  }

  if (trimmed === "id") return { kind: "id" }
  if (trimmed === "id -u") return { kind: "id-u" }
  if (trimmed === "id -un") return { kind: "id-un" }
  if (trimmed === "pwd") return { kind: "pwd" }

  const getpropMatch = trimmed.match(/^getprop\s+([A-Za-z0-9._-]+)$/)
  if (getpropMatch) {
    const key = getpropMatch[1]
    return safeGetpropKeys.has(key)
      ? { kind: "getprop", key }
      : { kind: "invalid", message: `getprop key is not allowed: ${key}` }
  }

  return { kind: "invalid", message: "command is not allowed in safe mode" }
}

function parseTabularItems(stdout: string): Array<Record<string, unknown>> {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [name = "", type = "file", sizeText = ""] = line.split("\t")
      const size = /^\d+$/.test(sizeText) ? Number(sizeText) : null
      return { name, type, size }
    })
}

export async function listAndroidDevices(): Promise<AndroidGatewayEnvelope> {
  const snapshot = await discoverAndroid()
  return {
    success: true,
    stdout: "",
    stderr: "",
    exit_code: 0,
    data: {
      adbPath: snapshot.adbPath,
      devices: snapshot.devices
    }
  }
}

export async function getAndroidDeviceInfo(serial: string): Promise<AndroidGatewayEnvelope> {
  const normalizedSerial = serial.trim()
  setCurrentAndroidDevice(normalizedSerial)

  const model = await runSerialShell(normalizedSerial, ["shell", "getprop", "ro.product.model"])
  if (!model.success) return withSerialData(model, normalizedSerial, { operation: "info" })

  const device = await runSerialShell(normalizedSerial, ["shell", "getprop", "ro.product.device"])
  const manufacturer = await runSerialShell(normalizedSerial, ["shell", "getprop", "ro.product.manufacturer"])
  const brand = await runSerialShell(normalizedSerial, ["shell", "getprop", "ro.product.brand"])
  const release = await runSerialShell(normalizedSerial, ["shell", "getprop", "ro.build.version.release"])
  const sdk = await runSerialShell(normalizedSerial, ["shell", "getprop", "ro.build.version.sdk"])
  const fingerprint = await runSerialShell(normalizedSerial, ["shell", "getprop", "ro.build.fingerprint"])
  const serialno = await runSerialShell(normalizedSerial, ["shell", "getprop", "ro.serialno"])
  const abi = await runSerialShell(normalizedSerial, ["shell", "getprop", "ro.product.cpu.abi"])
  const currentUser = await runSerialShell(normalizedSerial, ["shell", "sh", "-c", "id -un 2>/dev/null || echo shell"])

  const stdout = [
    `model=${model.stdout.trim()}`,
    `device=${device.stdout.trim()}`,
    `manufacturer=${manufacturer.stdout.trim()}`,
    `brand=${brand.stdout.trim()}`,
    `os_version=${release.stdout.trim()}`,
    `sdk=${sdk.stdout.trim()}`,
    `fingerprint=${fingerprint.stdout.trim()}`,
    `serial_number=${serialno.stdout.trim()}`,
    `cpu_abi=${abi.stdout.trim()}`,
    `current_user=${currentUser.stdout.trim()}`
  ].join("\n")

  return {
    success: true,
    stdout,
    stderr: "",
    exit_code: 0,
    data: {
      serial: normalizedSerial,
      operation: "info",
      payload: {
        model: model.stdout.trim(),
        device: device.stdout.trim(),
        manufacturer: manufacturer.stdout.trim(),
        brand: brand.stdout.trim(),
        os_caption: "Android",
        os_version: release.stdout.trim(),
        sdk: sdk.stdout.trim(),
        fingerprint: fingerprint.stdout.trim(),
        serial_number: serialno.stdout.trim(),
        cpu_abi: abi.stdout.trim(),
        current_user: currentUser.stdout.trim(),
        drives: [{ name: "/sdcard", file_system: "android" }],
        ipv4_addresses: []
      }
    }
  }
}

export async function executeAndroidSafeShell(serial: string, command: string): Promise<AndroidGatewayEnvelope> {
  const normalizedSerial = serial.trim()
  const parsed = validateSafeShell(command)
  if (parsed.kind === "invalid") {
    return invalidEnvelope(parsed.message)
  }

  setCurrentAndroidDevice(normalizedSerial)

  let result: AndroidGatewayEnvelope
  if (parsed.kind === "getprop") {
    result = await runSerialShell(normalizedSerial, ["shell", "getprop", parsed.key])
  } else if (parsed.kind === "id") {
    result = await runSerialShell(normalizedSerial, ["shell", "id"])
  } else if (parsed.kind === "id-u") {
    result = await runSerialShell(normalizedSerial, ["shell", "id", "-u"])
  } else if (parsed.kind === "id-un") {
    result = await runSerialShell(normalizedSerial, ["shell", "sh", "-c", "id -un"])
  } else {
    result = await runSerialShell(normalizedSerial, ["shell", "pwd"])
  }

  return withSerialData(result, normalizedSerial, {
    operation: "safe-shell",
    command: command.trim()
  })
}

export async function listAndroidFiles(serial: string, path: string): Promise<AndroidGatewayEnvelope> {
  const normalizedSerial = serial.trim()
  const normalizedPath = path.trim()
  if (!normalizedPath) {
    return invalidEnvelope("path is required")
  }

  setCurrentAndroidDevice(normalizedSerial)

  const script = `
target=${shLiteral(normalizedPath)}
if [ ! -e "$target" ]; then
  echo "Remote path not found: ${normalizedPath}" >&2
  exit 1
fi
if [ ! -d "$target" ]; then
  echo "Remote path is not a directory: ${normalizedPath}" >&2
  exit 1
fi
for item in "$target"/* "$target"/.[!.]* "$target"/..?*; do
  [ -e "$item" ] || continue
  name=$(basename "$item")
  if [ -d "$item" ]; then
    kind=directory
    size=
  else
    kind=file
    size=$(wc -c < "$item" 2>/dev/null | tr -d ' ')
  fi
  printf '%s\\t%s\\t%s\\n' "$name" "$kind" "$size"
done
`
  const result = await runShellScript(normalizedSerial, script)
  return withSerialData(result, normalizedSerial, {
    operation: "list-files",
    path: normalizedPath,
    entries: result.success ? parseTabularItems(result.stdout) : []
  })
}

export async function mkdirAndroidDirectory(serial: string, path: string, recursive = true): Promise<AndroidGatewayEnvelope> {
  const validated = validateAndroidMkdirRequest(path, recursive)
  if ("error" in validated) {
    return invalidEnvelope(validated.error)
  }

  const normalizedSerial = serial.trim()
  const { path: normalizedPath, recursive: recursiveMode } = validated.value
  setCurrentAndroidDevice(normalizedSerial)

  const script = recursiveMode
    ? `
target=${shLiteral(normalizedPath)}
if [ -e "$target" ] && [ ! -d "$target" ]; then
  echo "Remote path is not a directory: ${normalizedPath}" >&2
  exit 1
fi
if [ -d "$target" ]; then
  printf 'created=0\\n'
  exit 0
fi
mkdir -p "$target"
printf 'created=1\\n'
`
    : `
target=${shLiteral(normalizedPath)}
parent=$(dirname "$target")
if [ ! -d "$parent" ]; then
  echo "Parent directory does not exist: $parent" >&2
  exit 1
fi
if [ -e "$target" ] && [ ! -d "$target" ]; then
  echo "Remote path is not a directory: ${normalizedPath}" >&2
  exit 1
fi
if [ -d "$target" ]; then
  printf 'created=0\\n'
  exit 0
fi
mkdir "$target"
printf 'created=1\\n'
`

  const result = await runShellScript(normalizedSerial, script)
  if (!result.success) {
    return withSerialData(result, normalizedSerial, {
      operation: "mkdir",
      path: normalizedPath,
      recursive: recursiveMode
    })
  }

  const created = result.stdout.includes("created=1")
  return successEnvelope({
    serial: normalizedSerial,
    operation: "mkdir",
    payload: {
      path: normalizedPath,
      recursive: recursiveMode,
      created
    }
  }, result.stdout, result.stderr)
}

export async function readAndroidFile(serial: string, path: string, encoding = "utf-8"): Promise<AndroidGatewayEnvelope> {
  const normalizedSerial = serial.trim()
  const normalizedPath = path.trim()
  if (!normalizedPath) {
    return invalidEnvelope("path is required")
  }

  setCurrentAndroidDevice(normalizedSerial)

  const metaScript = `
target=${shLiteral(normalizedPath)}
if [ ! -e "$target" ]; then
  echo "Remote file not found: ${normalizedPath}" >&2
  exit 1
fi
if [ -d "$target" ]; then
  echo "Remote path is a directory, not a file: ${normalizedPath}" >&2
  exit 1
fi
size=$(wc -c < "$target" 2>/dev/null | tr -d ' ')
printf '%s\\n' "$size"
`
  const meta = await runShellScript(normalizedSerial, metaScript)
  if (!meta.success) {
    return withSerialData(meta, normalizedSerial, {
      operation: "read-file",
      path: normalizedPath,
      encoding
    })
  }

  const content = await runShellScript(normalizedSerial, `cat ${shLiteral(normalizedPath)}`)
  return withSerialData(content, normalizedSerial, {
    operation: "read-file",
    path: normalizedPath,
    encoding,
    payload: {
      path: normalizedPath,
      encoding,
      size: /^\d+$/.test(meta.stdout.trim()) ? Number(meta.stdout.trim()) : null,
      content: content.stdout
    }
  })
}

export async function writeAndroidFile(serial: string, input: {
  path?: unknown
  content?: unknown
  mode?: unknown
  create_if_missing?: unknown
  createIfMissing?: unknown
  encoding?: unknown
}): Promise<AndroidGatewayEnvelope> {
  const validated = validateAndroidTextWriteRequest(input)
  if ("error" in validated) {
    return invalidEnvelope(validated.error)
  }

  const normalizedSerial = serial.trim()
  const request = validated.value
  const parentPath = posix.dirname(request.path)
  const targetName = posix.basename(request.path)
  const tempDirectory = mkdtempSync(join(tmpdir(), "codex-bridge-android-write-"))
  const localTempFile = join(tempDirectory, targetName)
  writeFileSync(localTempFile, request.content, { encoding: "utf8" })

  setCurrentAndroidDevice(normalizedSerial)

  try {
    const metaScript = `
target=${shLiteral(request.path)}
parent=${shLiteral(parentPath)}
if [ ! -d "$parent" ]; then
  echo "Parent directory does not exist: ${parentPath}" >&2
  exit 1
fi
if [ -d "$target" ]; then
  echo "Remote path is a directory, not a file: ${request.path}" >&2
  exit 1
fi
if [ -e "$target" ]; then
  printf 'created=0\\n'
else
  ${request.createIfMissing ? "printf 'created=1\\n'" : `echo "Remote file not found: ${request.path}" >&2; exit 1`}
fi
`
    const meta = await runShellScript(normalizedSerial, metaScript)
    if (!meta.success) {
      return withSerialData(meta, normalizedSerial, {
        operation: "files-write",
        path: request.path,
        mode: request.mode,
        encoding: request.encoding
      })
    }

    const created = meta.stdout.includes("created=1")
    let result: AndroidGatewayEnvelope

    if (request.mode === "overwrite" || created) {
      result = await runAdb(resolveAdbPath(), ["-s", normalizedSerial, "push", localTempFile, request.path])
    } else {
      const remoteTempPath = posix.join(parentPath, `.${targetName}.codex-bridge-${randomUUID()}.tmp`)
      const pushTemp = await runAdb(resolveAdbPath(), ["-s", normalizedSerial, "push", localTempFile, remoteTempPath])
      if (!pushTemp.success) {
        return withSerialData(pushTemp, normalizedSerial, {
          operation: "files-write",
          path: request.path,
          mode: request.mode,
          encoding: request.encoding
        })
      }

      result = await runShellScript(normalizedSerial, `
target=${shLiteral(request.path)}
tmp=${shLiteral(remoteTempPath)}
cat "$tmp" >> "$target"
status=$?
rm -f "$tmp"
exit $status
`)
    }

    if (!result.success) {
      return withSerialData(result, normalizedSerial, {
        operation: "files-write",
        path: request.path,
        mode: request.mode,
        encoding: request.encoding
      })
    }

    return successEnvelope({
      serial: normalizedSerial,
      operation: "files-write",
      payload: {
        path: request.path,
        bytes_written: request.bytesWritten,
        created,
        mode: request.mode,
        encoding: request.encoding
      }
    }, result.stdout, result.stderr)
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true })
  }
}

export async function pushAndroidFile(serial: string, input: {
  localPath?: unknown
  remotePath?: unknown
  path?: unknown
  overwrite?: unknown
}): Promise<AndroidGatewayEnvelope> {
  const validated = validateAndroidPushRequest(input)
  if ("error" in validated) {
    return invalidEnvelope(validated.error)
  }

  const normalizedSerial = serial.trim()
  const request = validated.value

  if (!existsSync(request.localPath)) {
    return invalidEnvelope(`localPath does not exist: ${request.localPath}`)
  }
  if (!lstatSync(request.localPath).isFile()) {
    return invalidEnvelope(`localPath is not a file: ${request.localPath}`)
  }

  const parentPath = posix.dirname(request.remotePath)
  setCurrentAndroidDevice(normalizedSerial)

  const meta = await runShellScript(normalizedSerial, `
target=${shLiteral(request.remotePath)}
parent=${shLiteral(parentPath)}
if [ ! -d "$parent" ]; then
  echo "Parent directory does not exist: ${parentPath}" >&2
  exit 1
fi
if [ -d "$target" ]; then
  echo "Remote path is a directory, not a file: ${request.remotePath}" >&2
  exit 1
fi
if ls "$target" >/dev/null 2>&1; then
  printf 'exists=1\\n'
else
  printf 'exists=0\\n'
fi
`)
  if (!meta.success) {
    return withSerialData(meta, normalizedSerial, {
      operation: "files-push",
      remotePath: request.remotePath,
      localPath: request.localPath
    })
  }

  const existed = meta.stdout.includes("exists=1")
  if (existed && !request.overwrite) {
    return invalidEnvelope(`Remote file already exists: ${request.remotePath}`)
  }

  const result = await runAdb(resolveAdbPath(), ["-s", normalizedSerial, "push", request.localPath, request.remotePath])
  if (!result.success) {
    return withSerialData(result, normalizedSerial, {
      operation: "files-push",
      remotePath: request.remotePath,
      localPath: request.localPath
    })
  }

  const bytesWritten = lstatSync(request.localPath).size
  return successEnvelope({
    serial: normalizedSerial,
    operation: "files-push",
    payload: {
      localPath: request.localPath,
      remotePath: request.remotePath,
      bytes_written: bytesWritten,
      overwritten: existed
    }
  }, result.stdout, result.stderr)
}

export async function pullAndroidFile(serial: string, path: string, localPath?: string): Promise<AndroidGatewayEnvelope> {
  const normalizedSerial = serial.trim()
  const normalizedPath = path.trim()
  if (!normalizedPath) {
    return invalidEnvelope("path is required")
  }

  const adbPath = resolveAdbPath()
  const outputDirectory = join(defaultPullRoot, normalizedSerial)
  mkdirSync(outputDirectory, { recursive: true })
  const destination = localPath?.trim() || join(outputDirectory, basename(normalizedPath))

  setCurrentAndroidDevice(normalizedSerial)
  const result = await runAdb(adbPath, ["-s", normalizedSerial, "pull", normalizedPath, destination])
  return withSerialData(result, normalizedSerial, {
    operation: "pull-file",
    remotePath: normalizedPath,
    localPath: destination
  })
}

export function getCurrentAndroidSelection(): { target: string, updatedAt: string } | null {
  return getCurrentAndroidDevice()
}

export function setCurrentAndroidSelection(serial: string): { target: string, updatedAt: string } | null {
  const normalizedSerial = serial.trim()
  if (!normalizedSerial) {
    return null
  }
  return setCurrentAndroidDevice(normalizedSerial)
}

export function clearCurrentAndroidSelection(): void {
  clearCurrentAndroidDevice()
}
