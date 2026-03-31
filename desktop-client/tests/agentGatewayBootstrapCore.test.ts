import test from "node:test"
import assert from "node:assert/strict"

import { buildGatewayAuthBootstrapInfo } from "../src/main/services/agentGatewayBootstrapCore.ts"

test("gateway bootstrap info exposes strategy instead of absolute token path", () => {
  const info = buildGatewayAuthBootstrapInfo("file", "BRIDGE_AGENT_TOKEN")
  assert.equal(info.envVar, "BRIDGE_AGENT_TOKEN")
  assert.equal(info.tokenSource, "file")
  assert.equal(info.localFileStrategy, "app-data-directory")
  assert.equal(info.localFileLocations.length > 0, true)
  assert.equal("tokenPath" in info, false)
  assert.deepEqual(info.resolutionOrder, [
    "read BRIDGE_AGENT_TOKEN",
    "if missing, read the local gateway token file from the application data directory"
  ])
})
