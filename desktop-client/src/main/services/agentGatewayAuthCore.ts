import type { IncomingHttpHeaders } from "node:http"
import { timingSafeEqual } from "node:crypto"

export type GatewayAuthMode = "public" | "bearer" | "header" | "missing"

export type PresentedGatewayToken = {
  token: string | null
  mode: "bearer" | "header" | "none"
}

export type GatewayAuthInfo = {
  required: boolean
  mode: GatewayAuthMode
}

export type GatewayAuthInspection = {
  authorized: boolean
  authInfo: GatewayAuthInfo
}

type HeaderCarrier = {
  headers: IncomingHttpHeaders
}

const gatewayTokenHeader = "x-codex-bridge-token"

function normalizeToken(value: string | undefined | null): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function timingSafeTokenMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8")
  const rightBuffer = Buffer.from(right, "utf8")
  if (leftBuffer.length !== rightBuffer.length) {
    return false
  }
  return timingSafeEqual(leftBuffer, rightBuffer)
}

export function isPublicGatewayRoute(method: string, pathname: string): boolean {
  return method === "GET" && pathname === "/health"
}

export function extractPresentedGatewayToken(request: HeaderCarrier): PresentedGatewayToken {
  const authorization = normalizeToken(Array.isArray(request.headers.authorization)
    ? request.headers.authorization[0]
    : request.headers.authorization)
  if (authorization?.startsWith("Bearer ")) {
    return {
      token: normalizeToken(authorization.slice("Bearer ".length)),
      mode: "bearer"
    }
  }

  const fromHeader = normalizeToken(Array.isArray(request.headers[gatewayTokenHeader])
    ? request.headers[gatewayTokenHeader][0]
    : request.headers[gatewayTokenHeader])
  if (fromHeader) {
    return { token: fromHeader, mode: "header" }
  }

  return { token: null, mode: "none" }
}

export function inspectGatewayAuthorizationAgainstToken(
  method: string,
  pathname: string,
  request: HeaderCarrier,
  expectedToken: string
): GatewayAuthInspection {
  if (isPublicGatewayRoute(method, pathname)) {
    return {
      authorized: true,
      authInfo: { required: false, mode: "public" }
    }
  }

  const { token, mode } = extractPresentedGatewayToken(request)
  if (!token) {
    return {
      authorized: false,
      authInfo: { required: true, mode: "missing" }
    }
  }
  if (!timingSafeTokenMatch(token, expectedToken)) {
    return {
      authorized: false,
      authInfo: {
        required: true,
        mode: mode === "bearer" ? "bearer" : "header"
      }
    }
  }

  return {
    authorized: true,
    authInfo: {
      required: true,
      mode: mode === "bearer" ? "bearer" : "header"
    }
  }
}
