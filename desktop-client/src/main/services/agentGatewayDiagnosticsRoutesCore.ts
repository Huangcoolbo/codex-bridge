import { successEnvelope, type GatewayRouteDefinition } from "./agentGatewayHttp.ts"
import type { GatewaySelfCheckReport } from "./agentGatewayDiagnosticsCore.ts"

export type DiagnosticsRouteDeps = {
  getAuthMetadata: () => {
    required: boolean
    schemes: string[]
    tokenSource: "env" | "file"
  }
  getSelfCheckReport: () => GatewaySelfCheckReport
}

export function createDiagnosticsRoutes(deps: DiagnosticsRouteDeps): GatewayRouteDefinition[] {
  return [
    {
      method: "GET",
      path: "/api/diagnostics/self-check",
      handler: ({ response }) => {
        const payload = successEnvelope({
          auth: deps.getAuthMetadata(),
          report: deps.getSelfCheckReport()
        })
        response.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store"
        })
        response.end(JSON.stringify(payload))
      }
    }
  ]
}
