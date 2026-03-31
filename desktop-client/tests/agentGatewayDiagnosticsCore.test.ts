import test from "node:test"
import assert from "node:assert/strict"

import { buildGatewaySelfCheckReport, diagnoseGatewayResult } from "../src/main/services/agentGatewayDiagnosticsCore.ts"

test("self-check reports missing python runtime as environment issue", () => {
  const report = buildGatewaySelfCheckReport({
    pythonPath: "D:\\missing\\python.exe",
    adbCheck: () => ({ ok: true, detail: "adb ready" })
  })

  assert.equal(report.issueSource, "environment")
  assert.equal(report.diagnosis.code, "python-runtime")
  assert.match(report.diagnosis.detail, /python/i)
})

test("windows probe refused connection is diagnosed as environment issue", () => {
  const diagnosis = diagnoseGatewayResult("windows-probe", {
    success: false,
    exit_code: 1,
    stdout: "",
    stderr: "connect to host 10.0.0.8 port 22: Connection refused"
  }, { target: "lab-win" })

  assert.equal(diagnosis.issueSource, "environment")
  assert.equal(diagnosis.code, "ssh-connect-refused")
})

test("silent failed result is diagnosed as likely code regression", () => {
  const diagnosis = diagnoseGatewayResult("windows-execute", {
    success: false,
    exit_code: 1,
    stdout: "",
    stderr: ""
  }, { target: "lab-win" })

  assert.equal(diagnosis.issueSource, "code-regression")
  assert.equal(diagnosis.code, "silent-failure-shape")
})
