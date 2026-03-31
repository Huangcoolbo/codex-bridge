import { getGatewayAuthMetadata } from "./agentGatewaySecurity"
import { buildGatewaySelfCheckReport } from "./agentGatewayDiagnosticsCore"
import { createDiagnosticsRoutes } from "./agentGatewayDiagnosticsRoutesCore"
import { getRuntimePaths } from "./runtimePaths"
import { resolveAdbPath } from "./androidService"

export { createDiagnosticsRoutes }

export const diagnosticsRoutes = createDiagnosticsRoutes({
  getAuthMetadata: getGatewayAuthMetadata,
  getSelfCheckReport: () => buildGatewaySelfCheckReport({
    pythonPath: getRuntimePaths().venvPython,
    adbCheck: () => {
      try {
        const resolved = resolveAdbPath()
        return {
          ok: true,
          detail: `已发现 adb：${resolved}`
        }
      } catch (error) {
        return {
          ok: false,
          detail: error instanceof Error ? error.message : String(error)
        }
      }
    }
  })
})
