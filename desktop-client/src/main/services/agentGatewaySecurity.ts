import type { IncomingMessage, ServerResponse } from "node:http"
import { randomBytes } from "node:crypto"
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"

import type { RequestContext } from "./agentGatewayHttp"
import { unauthorizedError } from "./agentGatewayHttp"
import {
  extractPresentedGatewayToken,
  inspectGatewayAuthorizationAgainstToken,
  isPublicGatewayRoute,
  type GatewayAuthInfo
} from "./agentGatewayAuthCore"
import { buildGatewayAuthBootstrapInfo } from "./agentGatewayBootstrapCore"
import { ensureRuntimeWorkspace, getRuntimePaths } from "./runtimePaths"

const gatewayTokenEnvVar = "BRIDGE_AGENT_TOKEN"
const callerHeader = "x-codex-bridge-caller"

type GatewayAuditEntry = {
  method: string
  pathname: string
  statusCode: number
  durationMs: number
  authMode: GatewayAuthInfo["mode"]
  caller: string | null
  remoteAddress: string | null
  userAgent: string | null
}

let cachedGatewayToken: string | null = null

function normalizeToken(value: string | undefined | null): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function resolveGatewayToken(): { token: string; source: "env" | "file" } {
  const fromEnv = normalizeToken(process.env[gatewayTokenEnvVar])
  if (fromEnv) {
    return { token: fromEnv, source: "env" }
  }

  if (cachedGatewayToken) {
    return { token: cachedGatewayToken, source: "file" }
  }

  const { gatewayTokenPath } = ensureRuntimeWorkspace()
  mkdirSync(dirname(gatewayTokenPath), { recursive: true })
  if (!existsSync(gatewayTokenPath)) {
    writeFileSync(gatewayTokenPath, `${randomBytes(24).toString("base64url")}\n`, "utf8")
  }

  cachedGatewayToken = readFileSync(gatewayTokenPath, "utf8").trim()
  return { token: cachedGatewayToken, source: "file" }
}

export function getGatewayAuthMetadata(): {
  required: boolean
  schemes: string[]
  tokenSource: "env" | "file"
} {
  const { source } = resolveGatewayToken()
  return {
    required: true,
    schemes: ["Authorization: Bearer <token>", "X-Codex-Bridge-Token: <token>"],
    tokenSource: source
  }
}

export function getGatewayAuthBootstrapInfo(): {
  envVar: string
  tokenSource: "env" | "file"
  localFileStrategy: "app-data-directory"
  localFileLocations: string[]
  resolutionOrder: string[]
} {
  const { source } = resolveGatewayToken()
  return buildGatewayAuthBootstrapInfo(source, gatewayTokenEnvVar)
}

export function inspectGatewayAuthorization(method: string, pathname: string, request: IncomingMessage): {
  authorized: boolean
  authInfo: GatewayAuthInfo
} {
  const expected = resolveGatewayToken()
  return inspectGatewayAuthorizationAgainstToken(method, pathname, request, expected.token)
}

export function assertGatewayAuthorization(context: Pick<RequestContext, "request" | "method" | "pathname">): GatewayAuthInfo {
  const inspection = inspectGatewayAuthorization(context.method, context.pathname, context.request)
  if (!inspection.authorized) {
    throw unauthorizedError("Missing or invalid gateway token.")
  }
  return inspection.authInfo
}

function appendGatewayAudit(entry: GatewayAuditEntry): void {
  const { gatewayAuditLogPath } = ensureRuntimeWorkspace()
  mkdirSync(dirname(gatewayAuditLogPath), { recursive: true })
  appendFileSync(gatewayAuditLogPath, `${JSON.stringify({
    ts: new Date().toISOString(),
    ...entry
  })}\n`, "utf8")
}

export function attachGatewayAudit(request: IncomingMessage, response: ServerResponse, method: string, pathname: string, authInfo: GatewayAuthInfo): void {
  const startedAt = Date.now()
  const caller = (Array.isArray(request.headers[callerHeader])
    ? request.headers[callerHeader][0]
    : request.headers[callerHeader])?.trim() || null
  const userAgent = (Array.isArray(request.headers["user-agent"])
    ? request.headers["user-agent"][0]
    : request.headers["user-agent"])?.trim() || null
  const remoteAddress = request.socket.remoteAddress?.trim() || null

  response.once("finish", () => {
    appendGatewayAudit({
      method,
      pathname,
      statusCode: response.statusCode,
      durationMs: Date.now() - startedAt,
      authMode: authInfo.mode,
      caller,
      remoteAddress,
      userAgent
    })
  })
}

export function getGatewayTokenHelpText(): string {
  return "Use a local gateway token via Authorization: Bearer <token> or X-Codex-Bridge-Token. Resolve it from BRIDGE_AGENT_TOKEN first, otherwise read the local token file."
}

export function getGatewayAuditHelpText(): string {
  return `Gateway request audit is written to ${getRuntimePaths().gatewayAuditLogPath}`
}
