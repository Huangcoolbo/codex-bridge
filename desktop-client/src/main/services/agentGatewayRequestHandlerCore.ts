import type { IncomingMessage, ServerResponse } from "node:http"

import type { GatewayRouteDefinition } from "./agentGatewayHttp.ts"
import { HttpError, respondJson } from "./agentGatewayHttp.ts"
import { resolveRoute } from "./agentGatewayRouter.ts"
import type { GatewayAuthInfo } from "./agentGatewayAuthCore.ts"

export type GatewaySecurityHooks = {
  inspectAuthorization: (method: string, pathname: string, request: IncomingMessage) => {
    authorized: boolean
    authInfo: GatewayAuthInfo
  }
  attachAudit: (request: IncomingMessage, response: ServerResponse, method: string, pathname: string, authInfo: GatewayAuthInfo) => void
}

export function createGatewayRequestHandler(
  routeDefinitions: GatewayRouteDefinition[],
  securityHooks: GatewaySecurityHooks,
  gatewayBaseUrl: string
): (request: IncomingMessage, response: ServerResponse) => Promise<void> {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const url = new URL(request.url || "/", gatewayBaseUrl)
    const method = request.method || "GET"
    const inspection = securityHooks.inspectAuthorization(method, url.pathname, request)
    const authInfo = inspection.authInfo
    securityHooks.attachAudit(request, response, method, url.pathname, authInfo)
    if (!inspection.authorized) {
      throw new HttpError(401, { success: false, error: "Missing or invalid gateway token." })
    }

    const resolved = resolveRoute(method, url.pathname, routeDefinitions)
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
}
