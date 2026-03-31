import { deleteProfile, loadDashboard, loadProfile, loadProfileSummary, probeProfile, saveGatewayTarget } from "./bridgeService"
import {
  badRequest,
  notFoundError,
  readBody,
  respondJson,
  type GatewayRouteDefinition
} from "./agentGatewayHttp"
import { clearCurrentTarget, getCurrentTarget, setCurrentTarget } from "./sessionService"

export const targetRoutes: GatewayRouteDefinition[] = [
  {
    method: "GET",
    path: "/api/targets",
    handler: ({ response }) => {
      const snapshot = loadDashboard()
      respondJson(response, 200, {
        success: true,
        profiles: snapshot.profiles,
        counts: snapshot.counts
      })
    }
  },
  {
    method: "GET",
    path: "/api/targets/current",
    handler: ({ response }) => {
      respondJson(response, 200, {
        success: true,
        current: getCurrentTarget()
      })
    }
  },
  {
    method: "POST",
    path: "/api/targets/current",
    handler: async (context) => {
      const body = await readBody<{ target?: string }>(context)
      const target = body.target?.trim()
      if (!target) {
        throw badRequest({ success: false, error: "target is required" })
      }
      const profile = loadProfileSummary(target)
      if (!profile) {
        throw notFoundError(`Unknown target: ${target}`)
      }
      respondJson(context.response, 200, {
        success: true,
        current: setCurrentTarget(target),
        profile
      })
    }
  },
  {
    method: "DELETE",
    path: "/api/targets/current",
    handler: ({ response }) => {
      clearCurrentTarget()
      respondJson(response, 200, { success: true })
    }
  },
  {
    method: "POST",
    path: "/api/targets",
    handler: async (context) => {
      const body = await readBody<Record<string, unknown>>(context)
      const profile = saveGatewayTarget(body)
      respondJson(context.response, 200, { success: true, profile })
    }
  },
  {
    method: "GET",
    path: "/api/targets/:target",
    handler: ({ response, params }) => {
      const profile = loadProfileSummary(params.target)
      if (!profile) {
        throw notFoundError(`Unknown target: ${params.target}`)
      }
      respondJson(response, 200, { success: true, profile })
    }
  },
  {
    method: "PUT",
    path: "/api/targets/:target",
    handler: async (context) => {
      const target = context.params.target
      if (!loadProfile(target)) {
        throw notFoundError(`Unknown target: ${target}`)
      }
      const body = await readBody<Record<string, unknown>>(context)
      const profile = saveGatewayTarget(body, target)
      if (getCurrentTarget()?.target === target) {
        const nextName = typeof body.name === "string" && body.name.trim() ? body.name.trim() : target
        setCurrentTarget(nextName)
      }
      respondJson(context.response, 200, { success: true, profile })
    }
  },
  {
    method: "DELETE",
    path: "/api/targets/:target",
    handler: ({ response, params }) => {
      const deleted = deleteProfile(params.target)
      if (!deleted) {
        throw notFoundError(`Unknown target: ${params.target}`)
      }
      if (getCurrentTarget()?.target === params.target) {
        clearCurrentTarget()
      }
      respondJson(response, 200, { success: true })
    }
  },
  {
    method: "POST",
    path: "/api/probe",
    handler: async (context) => {
      const body = await readBody<{ target?: string, passwordOverride?: string }>(context)
      const target = body.target?.trim()
      if (!target) {
        throw badRequest({ success: false, error: "target is required" })
      }
      setCurrentTarget(target)
      const result = await probeProfile(target, body.passwordOverride)
      respondJson(context.response, 200, result)
    }
  }
]
