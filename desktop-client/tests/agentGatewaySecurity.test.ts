import test from "node:test"
import assert from "node:assert/strict"

import {
  extractPresentedGatewayToken,
  inspectGatewayAuthorizationAgainstToken,
  isPublicGatewayRoute
} from "../src/main/services/agentGatewayAuthCore.ts"

function mockRequest(headers: Record<string, string | undefined>) {
  return {
    headers
  }
}

test("health route stays public", () => {
  assert.equal(isPublicGatewayRoute("GET", "/health"), true)
  assert.equal(isPublicGatewayRoute("POST", "/health"), false)
  assert.equal(isPublicGatewayRoute("GET", "/api/targets"), false)
})

test("extracts bearer token first", () => {
  const request = mockRequest({
    authorization: "Bearer secret-token",
    "x-codex-bridge-token": "fallback-token"
  })
  assert.deepEqual(extractPresentedGatewayToken(request), {
    token: "secret-token",
    mode: "bearer"
  })
})

test("authorizes matching bearer token", () => {
  const inspection = inspectGatewayAuthorizationAgainstToken(
    "POST",
    "/api/targets",
    mockRequest({ authorization: "Bearer bridge-test-token" }),
    "bridge-test-token"
  )
  assert.equal(inspection.authorized, true)
  assert.deepEqual(inspection.authInfo, {
    required: true,
    mode: "bearer"
  })
})

test("rejects missing token on protected routes", () => {
  const inspection = inspectGatewayAuthorizationAgainstToken(
    "POST",
    "/api/targets",
    mockRequest({}),
    "bridge-test-token"
  )
  assert.equal(inspection.authorized, false)
  assert.deepEqual(inspection.authInfo, {
    required: true,
    mode: "missing"
  })
})
