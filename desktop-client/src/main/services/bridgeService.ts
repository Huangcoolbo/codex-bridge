import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { execFile } from "node:child_process"
import { lookup as dnsLookup } from "node:dns/promises"
import { networkInterfaces } from "node:os"
import { Socket } from "node:net"

import type {
  AndroidProfileInput,
  DashboardSnapshot,
  ProfileDetail,
  ProfilePlatform,
  ProfileSummary,
  WindowsDiscoveryCandidate,
  WindowsDiscoverySnapshot,
  WindowsProfileInput
} from "@shared/contracts"
import { agentGatewayPort, agentGatewayUrl } from "./agentGatewayConfig"

const desktopClientRoot = process.cwd()
const projectRoot = resolve(desktopClientRoot, "..")
const registryPath = join(projectRoot, "data", "hosts.json")
const venvPython = join(projectRoot, ".venv", "Scripts", "python.exe")
const sshConfigPath = join(process.env.USERPROFILE ?? "", ".ssh", "config")
const projectDefaultWindowsKeyPath = join(projectRoot, "data", "ssh", "localhost_ed25519")
const pythonBridgeSnippet = [
  "import json, sys",
  "from pathlib import Path",
  "sys.path.insert(0, str(Path.cwd() / 'src'))",
  "from remote_agent_bridge.service import BridgeService",
  "from remote_agent_bridge.storage import HostRegistry",
  "registry_path = Path(sys.argv[1])",
  "method = sys.argv[2]",
  "payload = json.loads(sys.argv[3])",
  "service = BridgeService(HostRegistry(registry_path))",
  "if method == 'probe':",
  "    result = service.probe(payload['name'], password_override=payload.get('password_override'))",
  "elif method == 'execute':",
  "    result = service.execute(payload['name'], payload['command'], cwd=payload.get('cwd'), timeout_seconds=payload.get('timeout_seconds'), password_override=payload.get('password_override'))",
  "else:",
  "    raise ValueError(f'Unsupported method: {method}')",
  "print(json.dumps(result.to_dict()))",
  "sys.exit(result.exit_code)",
].join("\n")

type StoredProfile = {
  name: string
  hostname: string
  username: string
  port: number
  platform: ProfilePlatform
  transport: string
  description?: string | null
  auth: {
    method: "key" | "password"
    key_path?: string | null
    password?: string | null
  }
}

type GatewayTargetInput = {
  name?: string
  platform?: string
  host?: string
  hostname?: string
  port?: number
  user?: string
  username?: string
  auth_type?: string
  authMethod?: string
  password?: string
  store_password?: boolean
  storePassword?: boolean
  key_path?: string
  keyPath?: string
  note?: string
  description?: string
  serial?: string
}

type SshHostBlock = {
  aliases: string[]
  hostname?: string
  user?: string
  port?: number
  identityFile?: string | null
}

function ensureRegistry(): void {
  mkdirSync(join(projectRoot, "data"), { recursive: true })
  if (!existsSync(registryPath)) {
    writeFileSync(registryPath, JSON.stringify({ hosts: [] }, null, 2) + "\n", "utf8")
  }
}

function loadProfilesRaw(): StoredProfile[] {
  ensureRegistry()
  const payload = JSON.parse(readFileSync(registryPath, "utf8")) as { hosts?: StoredProfile[] }
  return [...(payload.hosts ?? [])].sort((left, right) => left.name.localeCompare(right.name))
}

function saveProfilesRaw(profiles: StoredProfile[]): void {
  ensureRegistry()
  const ordered = [...profiles].sort((left, right) => left.name.localeCompare(right.name))
  writeFileSync(registryPath, JSON.stringify({ hosts: ordered }, null, 2) + "\n", "utf8")
}

function normalizeGatewayString(value: string | undefined | null): string | undefined {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

function toGatewaySummary(profile: StoredProfile): Record<string, unknown> {
  const summary = toSummary(profile)
  return {
    ...summary,
    host: profile.hostname,
    user: profile.username,
    auth_type: profile.auth.method,
    key_path: profile.auth.key_path ?? null,
    note: profile.description ?? null
  }
}

function toSummary(profile: StoredProfile): ProfileSummary {
  const target = profile.transport === "adb"
    ? profile.hostname
    : `${profile.username}@${profile.hostname}:${profile.port}`
  return {
    name: profile.name,
    platform: profile.platform,
    transport: profile.transport,
    target,
    description: profile.description ?? null
  }
}

function toDetail(profile: StoredProfile): ProfileDetail {
  return {
    name: profile.name,
    hostname: profile.hostname,
    username: profile.username,
    port: profile.port,
    platform: profile.platform,
    transport: profile.transport,
    description: profile.description ?? null,
    authMethod: profile.auth.method,
    keyPath: profile.auth.key_path ?? null,
    hasStoredPassword: Boolean(profile.auth.password)
  }
}

function isLoopbackHost(hostname: string | undefined | null): boolean {
  if (!hostname) {
    return false
  }
  const normalized = hostname.trim().toLowerCase()
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1"
}

function withProjectManagedKeyDefaults(candidate: WindowsDiscoveryCandidate): WindowsDiscoveryCandidate {
  if (candidate.source === "registry" || !isLoopbackHost(candidate.hostname)) {
    return candidate
  }
  return {
    ...candidate,
    authMethod: "key",
    keyPath: projectDefaultWindowsKeyPath
  }
}

function resolvePython(): string {
  return existsSync(venvPython) ? venvPython : "python"
}

function runProcess(command: string, args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    execFile(command, args, { cwd: projectRoot, windowsHide: true }, (error, stdout, stderr) => {
      if (error && typeof error.code !== "number") {
        reject(error)
        return
      }
      resolvePromise({
        exitCode: typeof error?.code === "number" ? error.code : 0,
        stdout,
        stderr
      })
    })
  })
}

function parseJsonOrEnvelope(stdout: string, exitCode: number, stderr: string): Record<string, unknown> {
  const trimmed = stdout.trim()
  if (!trimmed) {
    return { success: exitCode === 0, exit_code: exitCode, stdout, stderr }
  }
  try {
    return JSON.parse(trimmed) as Record<string, unknown>
  } catch {
    return { success: exitCode === 0, exit_code: exitCode, stdout, stderr }
  }
}

async function runPythonBridge(method: "probe" | "execute", payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const result = await runProcess(resolvePython(), ["-c", pythonBridgeSnippet, registryPath, method, JSON.stringify(payload)])
  return parseJsonOrEnvelope(result.stdout, result.exitCode, result.stderr)
}

function expandHomePath(input: string | undefined): string | null {
  if (!input) {
    return null
  }
  const trimmed = input.trim()
  if (!trimmed) {
    return null
  }
  if (trimmed.startsWith("~/")) {
    return join(process.env.USERPROFILE ?? "", trimmed.slice(2))
  }
  return trimmed
}

function parseSshConfig(): SshHostBlock[] {
  if (!existsSync(sshConfigPath)) {
    return []
  }

  const lines = readFileSync(sshConfigPath, "utf8").split(/\r?\n/)
  const blocks: SshHostBlock[] = []
  let current: SshHostBlock | null = null

  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*/, "").trim()
    if (!line) {
      continue
    }

    const hostMatch = line.match(/^Host\s+(.+)$/i)
    if (hostMatch) {
      const aliases = hostMatch[1]
        .split(/\s+/)
        .map((item) => item.trim())
        .filter((item) => item && !item.includes("*") && !item.includes("?"))

      current = aliases.length > 0 ? { aliases } : null
      if (current) {
        blocks.push(current)
      }
      continue
    }

    if (!current) {
      continue
    }

    const entry = line.match(/^(\S+)\s+(.+)$/)
    if (!entry) {
      continue
    }

    const [, key, value] = entry
    switch (key.toLowerCase()) {
      case "hostname":
        current.hostname = value.trim()
        break
      case "user":
        current.user = value.trim()
        break
      case "port":
        current.port = Number(value.trim()) || 22
        break
      case "identityfile":
        current.identityFile = expandHomePath(value)
        break
      default:
        break
    }
  }

  return blocks.filter((block) => block.aliases.length > 0)
}

function isPrivateIpv4(address: string): boolean {
  return address.startsWith("10.") || address.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[0-1])\./.test(address)
}

function getLocalScanRange(): { rangeLabel: string | null; hosts: string[] } {
  const nets = networkInterfaces()
  for (const entries of Object.values(nets)) {
    for (const entry of entries ?? []) {
      if (entry.family !== "IPv4" || entry.internal || !isPrivateIpv4(entry.address)) {
        continue
      }
      const segments = entry.address.split(".")
      if (segments.length !== 4) {
        continue
      }
      const prefix = segments.slice(0, 3).join(".")
      const hosts = Array.from({ length: 254 }, (_value, index) => `${prefix}.${index + 1}`)
        .filter((host) => host !== entry.address)
      return { rangeLabel: `${prefix}.0/24`, hosts }
    }
  }
  return { rangeLabel: null, hosts: [] }
}

async function parseArpHosts(): Promise<string[]> {
  try {
    const result = await runProcess("arp", ["-a"])
    const matches = result.stdout.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) ?? []
    return [...new Set(matches.filter((host) => isPrivateIpv4(host)))]
  } catch {
    return []
  }
}

function testSshPort(hostname: string, timeoutMs = 280): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const socket = new Socket()
    let settled = false

    const finalize = (open: boolean) => {
      if (settled) {
        return
      }
      settled = true
      socket.destroy()
      resolvePromise(open)
    }

    socket.setTimeout(timeoutMs)
    socket.once("connect", () => finalize(true))
    socket.once("timeout", () => finalize(false))
    socket.once("error", () => finalize(false))
    socket.connect(22, hostname)
  })
}

async function scanSshHosts(): Promise<{ rangeLabel: string | null; hosts: string[] }> {
  const { rangeLabel, hosts } = getLocalScanRange()
  if (hosts.length === 0) {
    return { rangeLabel, hosts: [] }
  }

  const arpHosts = await parseArpHosts()
  const hostPool = [...new Set([...arpHosts, ...hosts])]
  const concurrency = 28
  const results: string[] = []

  for (let index = 0; index < hostPool.length; index += concurrency) {
    const batch = hostPool.slice(index, index + concurrency)
    const batchResults = await Promise.all(batch.map(async (host) => (await testSshPort(host)) ? host : null))
    for (const host of batchResults) {
      if (host) {
        results.push(host)
      }
    }
  }

  return { rangeLabel, hosts: [...new Set(results)].sort((left, right) => left.localeCompare(right, undefined, { numeric: true })) }
}

async function resolveQueryCandidate(query: string): Promise<WindowsDiscoveryCandidate[]> {
  const trimmed = query.trim()
  if (!trimmed) {
    return []
  }

  try {
    const resolved = await dnsLookup(trimmed)
    return [{
      id: `resolved:${trimmed}`,
      label: trimmed,
      hostname: resolved.address,
      port: 22,
      username: null,
      authMethod: null,
      keyPath: null,
      description: resolved.address === trimmed ? "Resolved host" : `${trimmed} -> ${resolved.address}`,
      source: "resolved"
    }]
  } catch {
    return []
  }
}

function toRegistryCandidate(profile: StoredProfile): WindowsDiscoveryCandidate {
  return {
    id: `registry:${profile.name}`,
    label: profile.name,
    hostname: profile.hostname,
    port: profile.port,
    username: profile.username,
    authMethod: profile.auth.method,
    keyPath: profile.auth.key_path ?? null,
    description: profile.description ?? null,
    source: "registry"
  }
}

function toSshConfigCandidates(): WindowsDiscoveryCandidate[] {
  return parseSshConfig().flatMap((block) => block.aliases.map((alias) => ({
    id: `ssh:${alias}`,
    label: alias,
    hostname: block.hostname?.trim() || alias,
    port: block.port ?? 22,
    username: block.user ?? null,
    authMethod: block.identityFile ? "key" : null,
    keyPath: block.identityFile ?? null,
    description: block.hostname && block.hostname !== alias ? block.hostname : null,
    source: "sshConfig" as const
  })))
}

function matchCandidate(candidate: WindowsDiscoveryCandidate, query: string): boolean {
  if (!query.trim()) {
    return true
  }
  const normalized = query.trim().toLowerCase()
  return [candidate.label, candidate.hostname, candidate.username ?? "", candidate.description ?? ""]
    .some((value) => value.toLowerCase().includes(normalized))
}

function mergeCandidates(candidates: WindowsDiscoveryCandidate[]): WindowsDiscoveryCandidate[] {
  const priority: Record<WindowsDiscoveryCandidate["source"], number> = {
    registry: 4,
    sshConfig: 3,
    resolved: 2,
    scan: 1
  }

  const merged = new Map<string, WindowsDiscoveryCandidate>()

  for (const candidate of candidates) {
    const key = `${candidate.hostname}:${candidate.port}`.toLowerCase()
    const current = merged.get(key)
    if (!current) {
      merged.set(key, candidate)
      continue
    }

    const preferred = priority[candidate.source] > priority[current.source] ? candidate : current
    const secondary = preferred === candidate ? current : candidate
    merged.set(key, {
      ...preferred,
      username: preferred.username ?? secondary.username ?? null,
      authMethod: preferred.authMethod ?? secondary.authMethod ?? null,
      keyPath: preferred.keyPath ?? secondary.keyPath ?? null,
      description: preferred.description ?? secondary.description ?? null,
      label: preferred.label || secondary.label
    })
  }

  return [...merged.values()].sort((left, right) => {
    const sourceDiff = priority[right.source] - priority[left.source]
    if (sourceDiff !== 0) {
      return sourceDiff
    }
    return left.label.localeCompare(right.label, undefined, { numeric: true })
  })
}

export function loadDashboard(): DashboardSnapshot {
  const profiles = loadProfilesRaw()
  const counts: Record<ProfilePlatform, number> = { windows: 0, android: 0, linux: 0 }
  for (const profile of profiles) {
    counts[profile.platform] += 1
  }

  return {
    appName: "Codex Bridge Workbench",
    environment: {
      electron: process.versions.electron,
      node: process.versions.node,
      chrome: process.versions.chrome,
      platform: process.platform,
      adbAvailable: false,
      pythonAvailable: existsSync(venvPython),
      defaultWindowsKeyPath: projectDefaultWindowsKeyPath,
      registryPath,
      projectRoot,
      agentGatewayPort,
      agentGatewayUrl
    },
    counts,
    profiles: profiles.map(toSummary)
  }
}

export function saveAndroidProfile(input: AndroidProfileInput): ProfileSummary {
  const profiles = loadProfilesRaw().filter((profile) => profile.name !== input.name)
  const nextProfile: StoredProfile = {
    name: input.name.trim(),
    hostname: input.serial.trim(),
    username: "shell",
    port: 22,
    platform: "android",
    transport: "adb",
    description: input.description?.trim() || null,
    auth: {
      method: "key",
      key_path: null,
      password: null
    }
  }
  profiles.push(nextProfile)
  saveProfilesRaw(profiles)
  return toSummary(nextProfile)
}

export function saveWindowsProfile(input: WindowsProfileInput): ProfileSummary {
  const profiles = loadProfilesRaw().filter((profile) => profile.name !== input.name)
  const nextProfile: StoredProfile = {
    name: input.name.trim(),
    hostname: input.hostname.trim(),
    username: input.username.trim(),
    port: input.port,
    platform: "windows",
    transport: "ssh",
    description: input.description?.trim() || null,
    auth: {
      method: input.authMethod,
      key_path: input.authMethod === "key" ? input.keyPath?.trim() || projectDefaultWindowsKeyPath : null,
      password: input.authMethod === "password" && input.storePassword ? input.password?.trim() || null : null
    }
  }
  profiles.push(nextProfile)
  saveProfilesRaw(profiles)
  return toSummary(nextProfile)
}

export function loadProfile(name: string): ProfileDetail | null {
  const profile = loadProfilesRaw().find((entry) => entry.name === name)
  return profile ? toDetail(profile) : null
}

export function loadProfileSummary(name: string): Record<string, unknown> | null {
  const profile = loadProfilesRaw().find((entry) => entry.name === name)
  return profile ? toGatewaySummary(profile) : null
}

export function deleteProfile(name: string): boolean {
  const profiles = loadProfilesRaw()
  const remaining = profiles.filter((profile) => profile.name !== name)
  if (remaining.length === profiles.length) {
    return false
  }
  saveProfilesRaw(remaining)
  return true
}

export function saveGatewayTarget(input: GatewayTargetInput, existingName?: string): Record<string, unknown> {
  const platform = normalizeGatewayString(input.platform)?.toLowerCase()
  const name = normalizeGatewayString(input.name)

  if (!name) {
    throw new Error("name is required")
  }

  if (!platform) {
    throw new Error("platform is required")
  }

  if (platform === "windows") {
    const hostname = normalizeGatewayString(input.host) ?? normalizeGatewayString(input.hostname)
    const username = normalizeGatewayString(input.user) ?? normalizeGatewayString(input.username)
    const authMethod = (normalizeGatewayString(input.auth_type) ?? normalizeGatewayString(input.authMethod) ?? "key").toLowerCase()
    const port = Number(input.port ?? 22)

    if (!hostname) {
      throw new Error("host is required for windows targets")
    }

    if (!username) {
      throw new Error("user is required for windows targets")
    }

    if (authMethod !== "key" && authMethod !== "password") {
      throw new Error("auth_type must be 'key' or 'password'")
    }

    const summary = saveWindowsProfile({
      name,
      hostname,
      username,
      port: Number.isFinite(port) ? port : 22,
      authMethod: authMethod as "key" | "password",
      keyPath: normalizeGatewayString(input.key_path) ?? normalizeGatewayString(input.keyPath),
      password: normalizeGatewayString(input.password),
      storePassword: Boolean(input.store_password ?? input.storePassword),
      description: normalizeGatewayString(input.note) ?? normalizeGatewayString(input.description)
    })

    if (existingName && existingName !== name) {
      deleteProfile(existingName)
    }

    return loadProfileSummary(summary.name) ?? { ...summary }
  }

  if (platform === "android") {
    const serial = normalizeGatewayString(input.serial) ?? normalizeGatewayString(input.host) ?? normalizeGatewayString(input.hostname)
    if (!serial) {
      throw new Error("serial is required for android targets")
    }

    const summary = saveAndroidProfile({
      name,
      serial,
      description: normalizeGatewayString(input.note) ?? normalizeGatewayString(input.description)
    })

    if (existingName && existingName !== name) {
      deleteProfile(existingName)
    }

    return loadProfileSummary(summary.name) ?? { ...summary }
  }

  throw new Error(`unsupported platform: ${platform}`)
}

export async function discoverWindows(query = ""): Promise<WindowsDiscoverySnapshot> {
  const profiles = loadProfilesRaw().filter((profile) => profile.platform === "windows").map(toRegistryCandidate)
  const sshConfigHosts = toSshConfigCandidates()
  const resolvedHosts = await resolveQueryCandidate(query)
  const scanned = await scanSshHosts()
  const scannedHosts: WindowsDiscoveryCandidate[] = scanned.hosts.map((host) => ({
    id: `scan:${host}`,
    label: host,
    hostname: host,
    port: 22,
    username: null,
    authMethod: null,
    keyPath: null,
    description: scanned.rangeLabel ? `SSH on ${scanned.rangeLabel}` : "SSH detected",
    source: "scan"
  }))

  const merged = mergeCandidates([
    ...profiles.filter((candidate) => matchCandidate(candidate, query)),
    ...sshConfigHosts.filter((candidate) => matchCandidate(candidate, query)),
    ...resolvedHosts,
    ...scannedHosts.filter((candidate) => matchCandidate(candidate, query) || !query.trim())
  ]).map(withProjectManagedKeyDefaults)

  return {
    query,
    scannedRange: scanned.rangeLabel,
    candidates: merged
  }
}

export function probeProfile(name: string, passwordOverride?: string): Promise<Record<string, unknown>> {
  return runPythonBridge("probe", {
    name,
    password_override: passwordOverride?.trim() || null
  })
}

export function executeProfile(name: string, command: string, passwordOverride?: string): Promise<Record<string, unknown>> {
  return runPythonBridge("execute", {
    name,
    command,
    password_override: passwordOverride?.trim() || null,
    cwd: null,
    timeout_seconds: null
  })
}
