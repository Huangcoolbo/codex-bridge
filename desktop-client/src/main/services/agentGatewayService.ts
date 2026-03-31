import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"

import { agentGatewayHost, agentGatewayPort, agentGatewayUrl } from "./agentGatewayConfig"
import { androidRoutes } from "./agentGatewayAndroidRoutes"
import { commandRoutes } from "./agentGatewayCommandRoutes"
import { diagnoseGatewayException } from "./agentGatewayDiagnosticsCore"
import { diagnosticsRoutes } from "./agentGatewayDiagnosticsRoutes"
import { HttpError, respondJson, type GatewayRouteDefinition } from "./agentGatewayHttp"
import {
  attachGatewayAudit,
  getGatewayAuthBootstrapInfo,
  getGatewayAuditHelpText,
  getGatewayAuthMetadata,
  getGatewayTokenHelpText,
  inspectGatewayAuthorization
} from "./agentGatewaySecurity"
import { createGatewayRequestHandler, type GatewaySecurityHooks } from "./agentGatewayRequestHandlerCore"
import { targetRoutes } from "./agentGatewayTargetRoutes"

let gatewayServer: Server | null = null

const healthRoutes: GatewayRouteDefinition[] = [
  {
    method: "GET",
    path: "/health",
    handler: ({ response }) => {
      respondJson(response, 200, {
        success: true,
        app: "Codex Bridge Workbench",
        gateway: {
          host: agentGatewayHost,
          port: agentGatewayPort,
          url: agentGatewayUrl,
          auth: getGatewayAuthMetadata(),
          auth_bootstrap: getGatewayAuthBootstrapInfo(),
          audit: {
            enabled: true,
            hint: getGatewayAuditHelpText()
          },
          token_hint: getGatewayTokenHelpText()
        }
      })
    }
  }
]

const routes: GatewayRouteDefinition[] = [
  ...healthRoutes,
  ...diagnosticsRoutes,
  ...androidRoutes,
  ...targetRoutes,
  ...commandRoutes
]

const defaultGatewaySecurityHooks: GatewaySecurityHooks = {
  inspectAuthorization: inspectGatewayAuthorization,
  attachAudit: attachGatewayAudit
}

export const handleRequest = createGatewayRequestHandler(routes, defaultGatewaySecurityHooks, agentGatewayUrl)

export function startAgentGateway(): void {
  if (gatewayServer) {
    return
  }

  gatewayServer = createServer((request, response) => {
    void handleRequest(request, response).catch((error) => {
      if (error instanceof HttpError) {
        respondJson(response, error.statusCode, error.payload)
        return
      }
      const diagnosis = diagnoseGatewayException("gateway-request", error)
      respondJson(response, 500, {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        diagnosis
      })
    })
  })

  gatewayServer.listen(agentGatewayPort, agentGatewayHost)
}

export function stopAgentGateway(): void {
  gatewayServer?.close()
  gatewayServer = null
}
