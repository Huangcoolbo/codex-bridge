import { execFile } from "node:child_process"
import { existsSync } from "node:fs"
import { join } from "node:path"

import type { AndroidDiscoverySnapshot, CommandEnvelope } from "@shared/contracts"

const adbCandidates = [
  join(process.env.USERPROFILE ?? "", "AppData", "Local", "Android", "Sdk", "platform-tools", "adb.exe"),
  join(process.env.USERPROFILE ?? "", "AppData", "Local", "Microsoft", "WinGet", "Links", "adb.exe")
]

function execCommand(command: string, args: string[], input?: string): Promise<CommandEnvelope> {
  return new Promise((resolve, reject) => {
    const child = execFile(command, args, { windowsHide: true }, (error, stdout, stderr) => {
      if (error && typeof error.code !== "number") {
        reject(error)
        return
      }
      resolve({
        success: !error,
        exitCode: typeof error?.code === "number" ? error.code : 0,
        stdout,
        stderr
      })
    })

    if (input) {
      child.stdin?.write(input)
      child.stdin?.end()
    }
  })
}

export function resolveAdbPath(explicitPath?: string): string {
  if (explicitPath?.trim()) {
    return explicitPath.trim()
  }
  const fromPath = process.env.PATH?.split(";").find((entry) => existsSync(join(entry, "adb.exe")))
  if (fromPath) {
    return join(fromPath, "adb.exe")
  }
  for (const candidate of adbCandidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }
  throw new Error("ADB executable was not found. Install Android platform-tools or choose adb.exe manually.")
}

function parseDevices(stdout: string): AndroidDiscoverySnapshot["devices"] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("List of devices attached"))
    .map((line) => {
      const tokens = line.split(/\s+/)
      const details: Record<string, string> = {}
      for (const token of tokens.slice(2)) {
        if (!token.includes(":")) {
          continue
        }
        const [key, value] = token.split(":", 2)
        details[key] = value
      }
      return {
        serial: tokens[0] ?? "",
        state: tokens[1] ?? "unknown",
        details
      }
    })
}

function parseServices(stdout: string): AndroidDiscoverySnapshot["services"] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("List of discovered mdns services"))
    .map((line) => {
      const parts = line.split(/\s+/, 3)
      return {
        instanceName: parts[0] ?? "",
        serviceType: parts[1] ?? "",
        address: parts[2] ?? ""
      }
    })
}

export async function discoverAndroid(adbPath?: string): Promise<AndroidDiscoverySnapshot> {
  const adb = resolveAdbPath(adbPath)
  await execCommand(adb, ["start-server"])
  const [devices, services] = await Promise.all([
    execCommand(adb, ["devices", "-l"]),
    execCommand(adb, ["mdns", "services"])
  ])

  return {
    adbPath: adb,
    devices: parseDevices(devices.stdout),
    services: parseServices(services.stdout)
  }
}

export function pairAndroid(endpoint: string, code: string, adbPath?: string): Promise<CommandEnvelope> {
  return execCommand(resolveAdbPath(adbPath), ["pair", endpoint], code + "\n")
}

export function connectAndroid(endpoint: string, adbPath?: string): Promise<CommandEnvelope> {
  return execCommand(resolveAdbPath(adbPath), ["connect", endpoint])
}

export function disconnectAndroid(endpoint?: string, adbPath?: string): Promise<CommandEnvelope> {
  const args = ["disconnect"]
  if (endpoint?.trim()) {
    args.push(endpoint.trim())
  }
  return execCommand(resolveAdbPath(adbPath), args)
}
