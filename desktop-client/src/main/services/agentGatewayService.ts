import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"

import { agentGatewayHost, agentGatewayPort, agentGatewayUrl } from "./agentGatewayConfig"
import { androidRoutes } from "./agentGatewayAndroidRoutes"
import { commandRoutes } from "./agentGatewayCommandRoutes"
import { HttpError, respondJson, type GatewayRouteDefinition } from "./agentGatewayHttp"
import { resolveRoute } from "./agentGatewayRouter"
import {
  attachGatewayAudit,
  getGatewayAuditHelpText,
  getGatewayAuthMetadata,
  getGatewayTokenHelpText,
  inspectGatewayAuthorization
} from "./agentGatewaySecurity"
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
  ...androidRoutes,
  ...targetRoutes,
  ...commandRoutes
]

export async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url || "/", agentGatewayUrl)
  const method = request.method || "GET"
  const inspection = inspectGatewayAuthorization(method, url.pathname, request)
  const authInfo = inspection.authInfo
  attachGatewayAudit(request, response, method, url.pathname, authInfo)
  if (!inspection.authorized) {
    throw new HttpError(401, { success: false, error: "Missing or invalid gateway token." })
  }
  const resolved = resolveRoute(method, url.pathname, routes)

  if (!resolved) {
    respondJson(response, 404, { success: false, error: "Not found" })
    return
  }

  await resolved.route.handler({
    request,
    response,
    url,
    method,
    pathname: url.pathname,
    params: resolved.match.params
  })
}

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
      respondJson(response, 500, {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      })
    })
  })

  gatewayServer.listen(agentGatewayPort, agentGatewayHost)
}

export function stopAgentGateway(): void {
  gatewayServer?.close()
  gatewayServer = null
}
