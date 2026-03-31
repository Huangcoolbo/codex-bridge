import test, { after, beforeEach } from "node:test"
import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import { Readable } from "node:stream"

import type { DashboardSnapshot, ProfileDetail, ProfileSummary } from "../src/shared/contracts.ts"
import { healthyDiagnosis } from "../src/main/services/agentGatewayDiagnosticsCore.ts"
import { inspectGatewayAuthorizationAgainstToken } from "../src/main/services/agentGatewayAuthCore.ts"
import { HttpError, respondJson } from "../src/main/services/agentGatewayHttp.ts"
import { createDiagnosticsRoutes } from "../src/main/services/agentGatewayDiagnosticsRoutesCore.ts"
import { createGatewayRequestHandler } from "../src/main/services/agentGatewayRequestHandlerCore.ts"
import { createTargetRoutes } from "../src/main/services/agentGatewayTargetRoutesCore.ts"

type StoredGatewayProfile = {
  name: string
  platform: "windows" | "android"
  host: string
  user?: string
  port?: number
  serial?: string
}

const profiles = new Map<string, StoredGatewayProfile>()
let currentTarget: { target: string; updatedAt: string } | null = null
const gatewayToken = "bridge-test-token"

function resetMockState(): void {
  profiles.clear()
  profiles.set("lab-win", {
    name: "lab-win",
    platform: "windows",
    host: "10.0.0.8",
    user: "ops",
    port: 22
  })
  currentTarget = null
}

function buildSummary(profile: StoredGatewayProfile): ProfileSummary {
  if (profile.platform === "windows") {
    return {
      name: profile.name,
      platform: "windows",
      transport: "ssh",
      target: `${profile.user}@${profile.host}:${profile.port}`
    }
  }

  return {
    name: profile.name,
    platform: "android",
    transport: "adb",
    target: profile.serial ?? profile.host
  }
}

function buildGatewayProfile(profile: StoredGatewayProfile): Record<string, unknown> {
  return {
    ...buildSummary(profile),
    host: profile.host,
    user: profile.user ?? null,
    auth_type: "key",
    key_path: null,
    note: null,
    serial: profile.serial ?? null
  }
}

function buildDetail(profile: StoredGatewayProfile): ProfileDetail {
  return {
    name: profile.name,
    hostname: profile.host,
    username: profile.user ?? "shell",
    port: profile.port ?? 22,
    platform: profile.platform,
    transport: profile.platform === "windows" ? "ssh" : "adb",
    description: null,
    authMethod: "key",
    keyPath: null,
    hasStoredPassword: false
  }
}

function countProfiles() {
  const counts = { windows: 0, android: 0, linux: 0 }
  for (const profile of profiles.values()) {
    if (profile.platform === "windows") {
      counts.windows += 1
    } else {
      counts.android += 1
    }
  }
  return counts
}

const targetRoutes = createTargetRoutes({
  loadDashboard: () => ({
    appName: "Codex Bridge Workbench",
    environment: {
      electron: "35.0.0",
      node: process.versions.node,
      chrome: "134.0.0.0",
      platform: process.platform,
      adbAvailable: false,
      pythonAvailable: false,
      defaultWindowsKeyPath: "D:\\mock\\localhost_ed25519",
      registryPath: "D:\\mock\\hosts.json",
      projectRoot: "D:\\mock",
      agentGatewayPort: 8765,
      agentGatewayUrl: "http://127.0.0.1:8765"
    },
    profiles: [...profiles.values()].map(buildSummary),
    counts: countProfiles()
  } satisfies DashboardSnapshot),
  loadProfileSummary: (name: string) => {
    const profile = profiles.get(name)
    return profile ? buildGatewayProfile(profile) : null
  },
  loadProfile: (name: string) => {
    const profile = profiles.get(name)
    return profile ? buildDetail(profile) : null
  },
  deleteProfile: (name: string) => profiles.delete(name),
  saveGatewayTarget: (input: Record<string, unknown>, existingName?: string) => {
    const name = String(input.name ?? "").trim()
    const platform = String(input.platform ?? "").trim()
    if (!name) {
      throw new Error("name is required")
    }
    if (platform === "windows") {
      const nextProfile: StoredGatewayProfile = {
        name,
        platform: "windows",
        host: String(input.host ?? input.hostname ?? "").trim(),
        user: String(input.user ?? input.username ?? "").trim() || "ops",
        port: Number(input.port ?? 22) || 22
      }
      if (existingName && existingName !== name) {
        profiles.delete(existingName)
      }
      profiles.set(name, nextProfile)
      return buildGatewayProfile(nextProfile)
    }
    if (platform === "android") {
      const nextProfile: StoredGatewayProfile = {
        name,
        platform: "android",
        host: String(input.serial ?? input.host ?? "").trim(),
        serial: String(input.serial ?? input.host ?? "").trim()
      }
      if (existingName && existingName !== name) {
        profiles.delete(existingName)
      }
      profiles.set(name, nextProfile)
      return buildGatewayProfile(nextProfile)
    }
    throw new Error(`unsupported platform: ${platform}`)
  },
  probeProfile: async (name: string) => ({
    success: true,
    exit_code: 0,
    stdout: `probe ok for ${name}`,
    stderr: "",
    host: name
  }),
  clearCurrentTarget: () => {
    currentTarget = null
  },
  getCurrentTarget: () => currentTarget ? { ...currentTarget } : null,
  setCurrentTarget: (target: string) => {
    currentTarget = {
      target: target.trim(),
      updatedAt: "2026-03-31T00:00:00.000Z"
    }
    return currentTarget ? { ...currentTarget } : null
  }
})

const diagnosticsRoutes = createDiagnosticsRoutes({
  getAuthMetadata: () => ({
    required: true,
    schemes: ["Authorization: Bearer <token>", "X-Codex-Bridge-Token: <token>"],
    tokenSource: "env"
  }),
  getSelfCheckReport: () => ({
    issueSource: "healthy",
    summary: "本地 gateway 依赖已就绪",
    checks: [
      {
        key: "python-runtime",
        ok: true,
        summary: "Python runtime 已就绪",
        detail: "mock python ready"
      }
    ],
    diagnosis: healthyDiagnosis("本地 gateway 依赖已就绪", "mock self-check ok")
  })
})

const gatewayHandler = createGatewayRequestHandler([...diagnosticsRoutes, ...targetRoutes], {
  inspectAuthorization: (method, pathname, request) => inspectGatewayAuthorizationAgainstToken(method, pathname, request, gatewayToken),
  attachAudit: () => {}
}, "http://127.0.0.1:8765")

class MockResponse extends EventEmitter {
  statusCode = 200
  headers: Record<string, string> = {}
  body = ""

  writeHead(statusCode: number, headers: Record<string, string>) {
    this.statusCode = statusCode
    this.headers = headers
    return this
  }

  end(chunk?: string | Buffer) {
    if (chunk) {
      this.body += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk
    }
    this.emit("finish")
    return this
  }
}

function createRequest(method: string, path: string, body?: unknown, token = gatewayToken) {
  const chunks = body === undefined ? [] : [JSON.stringify(body)]
  const request = Readable.from(chunks) as Readable & {
    method: string
    url: string
    headers: Record<string, string>
    socket: { remoteAddress: string }
  }

  request.method = method
  request.url = path
  request.headers = token ? { authorization: `Bearer ${token}` } : {}
  request.socket = { remoteAddress: "127.0.0.1" }
  return request
}

async function invokeGateway(method: string, path: string, options?: { body?: unknown; token?: string }) {
  const request = createRequest(method, path, options?.body, options?.token)
  const response = new MockResponse()

  try {
    await gatewayHandler(request as never, response as never)
  } catch (error) {
    if (error instanceof HttpError) {
      respondJson(response as never, error.statusCode, error.payload)
    } else {
      throw error
    }
  }

  return {
    statusCode: response.statusCode,
    payload: response.body ? JSON.parse(response.body) : null
  }
}

beforeEach(() => {
  resetMockState()
})

after(() => {
  profiles.clear()
  currentTarget = null
})

test("GET /api/targets returns the gateway target snapshot", async () => {
  const result = await invokeGateway("GET", "/api/targets")

  assert.equal(result.statusCode, 200)
  assert.equal(result.payload.success, true)
  assert.equal(result.payload.profiles.length, 1)
  assert.equal(result.payload.profiles[0].name, "lab-win")
  assert.equal(result.payload.counts.windows, 1)
})

test("GET /api/diagnostics/self-check returns a structured runtime report", async () => {
  const result = await invokeGateway("GET", "/api/diagnostics/self-check")

  assert.equal(result.statusCode, 200)
  assert.equal(result.payload.success, true)
  assert.equal(result.payload.data.auth.required, true)
  assert.equal(result.payload.data.report.issueSource, "healthy")
  assert.equal(result.payload.data.report.checks[0].key, "python-runtime")
})

test("POST /api/targets persists a remote host through the gateway route", async () => {
  const result = await invokeGateway("POST", "/api/targets", {
    body: {
      name: "ops-win",
      platform: "windows",
      host: "10.0.0.15",
      user: "administrator",
      port: 2222
    }
  })

  assert.equal(result.statusCode, 200)
  assert.equal(result.payload.success, true)
  assert.equal(result.payload.profile.name, "ops-win")
  assert.equal(profiles.has("ops-win"), true)
})

test("POST /api/targets/current sets the current target through the gateway route", async () => {
  const result = await invokeGateway("POST", "/api/targets/current", {
    body: { target: "lab-win" }
  })

  assert.equal(result.statusCode, 200)
  assert.equal(result.payload.success, true)
  assert.equal(result.payload.current.target, "lab-win")
  assert.equal(currentTarget?.target, "lab-win")
})

test("POST /api/probe updates current target and returns the structured probe result", async () => {
  const result = await invokeGateway("POST", "/api/probe", {
    body: { target: "lab-win" }
  })

  assert.equal(result.statusCode, 200)
  assert.equal(result.payload.success, true)
  assert.equal(result.payload.exit_code, 0)
  assert.match(result.payload.stdout, /probe ok for lab-win/)
  assert.equal(currentTarget?.target, "lab-win")
  assert.equal(result.payload.diagnosis.issueSource, "healthy")
})
