import test from "node:test"
import assert from "node:assert/strict"

import { matchRoute, resolveRoute, tokenizePath, type RouteDefinition } from "../src/main/services/agentGatewayRouter.ts"

test("tokenizePath drops empty segments", () => {
  assert.deepEqual(tokenizePath("/api/android/devices/"), ["api", "android", "devices"])
})

test("matchRoute matches static paths", () => {
  assert.deepEqual(matchRoute("/health", "/health"), { params: {} })
  assert.equal(matchRoute("/health", "/healthz"), null)
})

test("matchRoute extracts dynamic params", () => {
  assert.deepEqual(
    matchRoute("/api/android/devices/:serial/info", "/api/android/devices/ZY123/info"),
    { params: { serial: "ZY123" } }
  )
})

test("matchRoute decodes encoded params", () => {
  assert.deepEqual(
    matchRoute("/api/targets/:target", "/api/targets/lab%20win"),
    { params: { target: "lab win" } }
  )
})

test("resolveRoute finds registered routes by method and path", () => {
  const routes: RouteDefinition[] = [
    { method: "GET", path: "/health" },
    { method: "POST", path: "/api/android/devices/:serial/files/read" }
  ]
  const resolved = resolveRoute("POST", "/api/android/devices/serial-1/files/read", routes)
  assert.ok(resolved)
  assert.equal(resolved?.route.path, "/api/android/devices/:serial/files/read")
  assert.deepEqual(resolved?.match.params, { serial: "serial-1" })
})

test("resolveRoute rejects wrong HTTP method", () => {
  const routes: RouteDefinition[] = [
    { method: "GET", path: "/api/command/last" }
  ]
  assert.equal(resolveRoute("DELETE", "/api/command/last", routes), null)
})
