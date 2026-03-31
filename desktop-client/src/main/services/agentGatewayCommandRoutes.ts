import type { CommandExecutionRequest, CommandRunRequest } from "@shared/contracts"

import { executeCommand, getLastCommandResult, runCommand, setCommandDraft } from "./automationService"
import {
  badRequest,
  readBody,
  respondJson,
  respondWithResult,
  type GatewayRouteDefinition
} from "./agentGatewayHttp"

export const commandRoutes: GatewayRouteDefinition[] = [
  {
    method: "POST",
    path: "/api/command/set",
    handler: async (context) => {
      const body = await readBody<{
        command?: string
        target?: string
        shell?: CommandExecutionRequest["shell"]
        passwordOverride?: string
      }>(context)
      if (!body.command?.trim()) {
        throw badRequest({ success: false, error: "command is required" })
      }
      const draft = setCommandDraft(body.command, body.target, body.shell, body.passwordOverride)
      respondJson(context.response, 200, draft)
    }
  },
  {
    method: "POST",
    path: "/api/command/run",
    handler: async (context) => {
      const body = await readBody<CommandRunRequest>(context)
      const result = await runCommand(body)
      respondWithResult(context.response, result)
    }
  },
  {
    method: "GET",
    path: "/api/command/last",
    handler: ({ response }) => {
      respondJson(response, 200, {
        success: true,
        result: getLastCommandResult()
      })
    }
  },
  {
    method: "POST",
    path: "/api/command/execute",
    handler: async (context) => {
      const body = await readBody<CommandExecutionRequest>(context)
      if (!body.target?.trim() || !body.command?.trim()) {
        throw badRequest({ success: false, error: "target and command are required" })
      }
      const result = await executeCommand({
        target: body.target.trim(),
        shell: body.shell,
        command: body.command,
        passwordOverride: body.passwordOverride
      })
      respondWithResult(context.response, result)
    }
  }
]
