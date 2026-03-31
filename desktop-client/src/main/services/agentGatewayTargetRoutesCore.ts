import type { deleteProfile, loadDashboard, loadProfile, loadProfileSummary, probeProfile, saveGatewayTarget } from "./bridgeService.ts"
import {
  badRequest,
  notFoundError,
  readBody,
  respondJson,
  type GatewayRouteDefinition
} from "./agentGatewayHttp.ts"
import { attachGatewayDiagnosis } from "./agentGatewayDiagnosticsCore.ts"
import type { clearCurrentTarget, getCurrentTarget, setCurrentTarget } from "./sessionService.ts"

export type TargetRouteDeps = {
  loadDashboard: typeof loadDashboard
  loadProfile: typeof loadProfile
  loadProfileSummary: typeof loadProfileSummary
  probeProfile: typeof probeProfile
  saveGatewayTarget: typeof saveGatewayTarget
  deleteProfile: typeof deleteProfile
  clearCurrentTarget: typeof clearCurrentTarget
  getCurrentTarget: typeof getCurrentTarget
  setCurrentTarget: typeof setCurrentTarget
}

export function createTargetRoutes(deps: TargetRouteDeps): GatewayRouteDefinition[] {
  return [
    {
      method: "GET",
      path: "/api/targets",
      handler: ({ response }) => {
        const snapshot = deps.loadDashboard()
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
          current: deps.getCurrentTarget()
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
        const profile = deps.loadProfileSummary(target)
        if (!profile) {
          throw notFoundError(`Unknown target: ${target}`)
        }
        respondJson(context.response, 200, {
          success: true,
          current: deps.setCurrentTarget(target),
          profile
        })
      }
    },
    {
      method: "DELETE",
      path: "/api/targets/current",
      handler: ({ response }) => {
        deps.clearCurrentTarget()
        respondJson(response, 200, { success: true })
      }
    },
    {
      method: "POST",
      path: "/api/targets",
      handler: async (context) => {
        const body = await readBody<Record<string, unknown>>(context)
        const profile = deps.saveGatewayTarget(body)
        respondJson(context.response, 200, { success: true, profile })
      }
    },
    {
      method: "GET",
      path: "/api/targets/:target",
      handler: ({ response, params }) => {
        const profile = deps.loadProfileSummary(params.target)
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
        if (!deps.loadProfile(target)) {
          throw notFoundError(`Unknown target: ${target}`)
        }
        const body = await readBody<Record<string, unknown>>(context)
        const profile = deps.saveGatewayTarget(body, target)
        if (deps.getCurrentTarget()?.target === target) {
          const nextName = typeof body.name === "string" && body.name.trim() ? body.name.trim() : target
          deps.setCurrentTarget(nextName)
        }
        respondJson(context.response, 200, { success: true, profile })
      }
    },
    {
      method: "DELETE",
      path: "/api/targets/:target",
      handler: ({ response, params }) => {
        const deleted = deps.deleteProfile(params.target)
        if (!deleted) {
          throw notFoundError(`Unknown target: ${params.target}`)
        }
        if (deps.getCurrentTarget()?.target === params.target) {
          deps.clearCurrentTarget()
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
      deps.setCurrentTarget(target)
      const result = await deps.probeProfile(target, body.passwordOverride)
      respondJson(context.response, 200, attachGatewayDiagnosis("windows-probe", result, { target }))
    }
  }
  ]
}
