import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"

import type { CommandExecutionRequest, CommandRunRequest } from "@shared/contracts"

import {
  clearCurrentAndroidSelection,
  executeAndroidSafeShell,
  getAndroidDeviceInfo,
  getCurrentAndroidSelection,
  listAndroidDevices,
  listAndroidFiles,
  mkdirAndroidDirectory,
  pushAndroidFile,
  pullAndroidFile,
  readAndroidFile,
  writeAndroidFile,
  setCurrentAndroidSelection
} from "./androidGatewayService"
import { executeCommand, getLastCommandResult, runCommand, setCommandDraft } from "./automationService"
import { agentGatewayHost, agentGatewayPort, agentGatewayUrl } from "./agentGatewayConfig"
import { deleteProfile, loadDashboard, loadProfile, loadProfileSummary, probeProfile, saveGatewayTarget } from "./bridgeService"
import { clearCurrentTarget, getCurrentTarget, setCurrentTarget } from "./sessionService"

let gatewayServer: Server | null = null

function respondJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  })
  response.end(JSON.stringify(payload))
}

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  if (chunks.length === 0) {
    return {} as T
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T
}

function notFound(response: ServerResponse): void {
  respondJson(response, 404, { success: false, error: "Not found" })
}

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url || "/", agentGatewayUrl)
  const method = request.method || "GET"
  const androidCurrentPath = "/api/android/current"
  const androidDeviceInfoMatch = url.pathname.match(/^\/api\/android\/devices\/([^/]+)\/info$/)
  const androidShellMatch = url.pathname.match(/^\/api\/android\/devices\/([^/]+)\/shell\/execute$/)
  const androidListMatch = url.pathname.match(/^\/api\/android\/devices\/([^/]+)\/files\/list$/)
  const androidMkdirMatch = url.pathname.match(/^\/api\/android\/devices\/([^/]+)\/files\/mkdir$/)
  const androidReadMatch = url.pathname.match(/^\/api\/android\/devices\/([^/]+)\/files\/read$/)
  const androidWriteMatch = url.pathname.match(/^\/api\/android\/devices\/([^/]+)\/files\/write$/)
  const androidPushMatch = url.pathname.match(/^\/api\/android\/devices\/([^/]+)\/files\/push$/)
  const androidPullMatch = url.pathname.match(/^\/api\/android\/devices\/([^/]+)\/files\/pull$/)

  if (method === "GET" && url.pathname === "/health") {
    respondJson(response, 200, {
      success: true,
      app: "Codex Bridge Workbench",
      gateway: {
        host: agentGatewayHost,
        port: agentGatewayPort,
        url: agentGatewayUrl
      }
    })
    return
  }

  if (method === "GET" && url.pathname === "/api/android/devices") {
    const result = await listAndroidDevices()
    respondJson(response, result.success ? 200 : 400, result)
    return
  }

  if (url.pathname === androidCurrentPath) {
    if (method === "GET") {
      respondJson(response, 200, {
        success: true,
        stdout: "",
        stderr: "",
        exit_code: 0,
        data: {
          current: getCurrentAndroidSelection()
        }
      })
      return
    }

    if (method === "POST") {
      const body = await readJsonBody<{ serial?: string }>(request)
      if (!body.serial?.trim()) {
        respondJson(response, 400, {
          success: false,
          stdout: "",
          stderr: "serial is required",
          exit_code: 1,
          data: null
        })
        return
      }
      respondJson(response, 200, {
        success: true,
        stdout: "",
        stderr: "",
        exit_code: 0,
        data: {
          current: setCurrentAndroidSelection(body.serial)
        }
      })
      return
    }

    if (method === "DELETE") {
      clearCurrentAndroidSelection()
      respondJson(response, 200, {
        success: true,
        stdout: "",
        stderr: "",
        exit_code: 0,
        data: {
          current: null
        }
      })
      return
    }
  }

  if (method === "GET" && androidDeviceInfoMatch) {
    const serial = decodeURIComponent(androidDeviceInfoMatch[1])
    const result = await getAndroidDeviceInfo(serial)
    respondJson(response, result.success ? 200 : 400, result)
    return
  }

  if (method === "POST" && androidShellMatch) {
    const serial = decodeURIComponent(androidShellMatch[1])
    const body = await readJsonBody<{ command?: string }>(request)
    const result = await executeAndroidSafeShell(serial, body.command ?? "")
    respondJson(response, result.success ? 200 : 400, result)
    return
  }

  if (method === "POST" && androidListMatch) {
    const serial = decodeURIComponent(androidListMatch[1])
    const body = await readJsonBody<{ path?: string }>(request)
    const result = await listAndroidFiles(serial, body.path ?? "")
    respondJson(response, result.success ? 200 : 400, result)
    return
  }

  if (method === "POST" && androidMkdirMatch) {
    const serial = decodeURIComponent(androidMkdirMatch[1])
    const body = await readJsonBody<{ path?: string, recursive?: boolean }>(request)
    const result = await mkdirAndroidDirectory(serial, body.path ?? "", body.recursive ?? true)
    respondJson(response, result.success ? 200 : 400, result)
    return
  }

  if (method === "POST" && androidReadMatch) {
    const serial = decodeURIComponent(androidReadMatch[1])
    const body = await readJsonBody<{ path?: string, encoding?: string }>(request)
    const result = await readAndroidFile(serial, body.path ?? "", body.encoding ?? "utf-8")
    respondJson(response, result.success ? 200 : 400, result)
    return
  }

  if (method === "POST" && androidWriteMatch) {
    const serial = decodeURIComponent(androidWriteMatch[1])
    const body = await readJsonBody<{
      path?: string
      content?: string
      mode?: string
      create_if_missing?: boolean
      createIfMissing?: boolean
      encoding?: string
    }>(request)
    const result = await writeAndroidFile(serial, body)
    respondJson(response, result.success ? 200 : 400, result)
    return
  }

  if (method === "POST" && androidPushMatch) {
    const serial = decodeURIComponent(androidPushMatch[1])
    const body = await readJsonBody<{
      localPath?: string
      remotePath?: string
      path?: string
      overwrite?: boolean
    }>(request)
    const result = await pushAndroidFile(serial, body)
    respondJson(response, result.success ? 200 : 400, result)
    return
  }

  if (method === "POST" && androidPullMatch) {
    const serial = decodeURIComponent(androidPullMatch[1])
    const body = await readJsonBody<{ path?: string, localPath?: string }>(request)
    const result = await pullAndroidFile(serial, body.path ?? "", body.localPath)
    respondJson(response, result.success ? 200 : 400, result)
    return
  }

  if (method === "GET" && url.pathname === "/api/targets") {
    const snapshot = loadDashboard()
    respondJson(response, 200, {
      success: true,
      profiles: snapshot.profiles,
      counts: snapshot.counts
    })
    return
  }

  if (url.pathname === "/api/targets/current") {
    if (method === "GET") {
      const session = getCurrentTarget()
      respondJson(response, 200, {
        success: true,
        current: session
      })
      return
    }

    if (method === "POST") {
      const body = await readJsonBody<{ target?: string }>(request)
      if (!body.target?.trim()) {
        respondJson(response, 400, { success: false, error: "target is required" })
        return
      }
      const profile = loadProfileSummary(body.target.trim())
      if (!profile) {
        respondJson(response, 404, { success: false, error: `Unknown target: ${body.target.trim()}` })
        return
      }
      respondJson(response, 200, {
        success: true,
        current: setCurrentTarget(body.target.trim()),
        profile
      })
      return
    }

    if (method === "DELETE") {
      clearCurrentTarget()
      respondJson(response, 200, { success: true })
      return
    }
  }

  if (method === "POST" && url.pathname === "/api/targets") {
    const body = await readJsonBody<Record<string, unknown>>(request)
    const profile = saveGatewayTarget(body)
    respondJson(response, 200, { success: true, profile })
    return
  }

  if (method === "GET" && url.pathname.startsWith("/api/targets/")) {
    const target = decodeURIComponent(url.pathname.slice("/api/targets/".length))
    const profile = loadProfileSummary(target)
    if (!profile) {
      respondJson(response, 404, { success: false, error: `Unknown target: ${target}` })
      return
    }
    respondJson(response, 200, { success: true, profile })
    return
  }

  if (method === "PUT" && url.pathname.startsWith("/api/targets/")) {
    const target = decodeURIComponent(url.pathname.slice("/api/targets/".length))
    if (!loadProfile(target)) {
      respondJson(response, 404, { success: false, error: `Unknown target: ${target}` })
      return
    }
    const body = await readJsonBody<Record<string, unknown>>(request)
    const profile = saveGatewayTarget(body, target)
    if (getCurrentTarget()?.target === target) {
      const nextName = typeof body.name === "string" && body.name.trim() ? body.name.trim() : target
      setCurrentTarget(nextName)
    }
    respondJson(response, 200, { success: true, profile })
    return
  }

  if (method === "DELETE" && url.pathname.startsWith("/api/targets/")) {
    const target = decodeURIComponent(url.pathname.slice("/api/targets/".length))
    const deleted = deleteProfile(target)
    if (!deleted) {
      respondJson(response, 404, { success: false, error: `Unknown target: ${target}` })
      return
    }
    if (getCurrentTarget()?.target === target) {
      clearCurrentTarget()
    }
    respondJson(response, 200, { success: true })
    return
  }

  if (method === "POST" && url.pathname === "/api/probe") {
    const body = await readJsonBody<{ target?: string, passwordOverride?: string }>(request)
    if (!body.target?.trim()) {
      respondJson(response, 400, { success: false, error: "target is required" })
      return
    }
    setCurrentTarget(body.target.trim())
    const result = await probeProfile(body.target.trim(), body.passwordOverride)
    respondJson(response, 200, result)
    return
  }

  if (method === "POST" && url.pathname === "/api/command/set") {
    const body = await readJsonBody<{ command?: string, target?: string, shell?: CommandExecutionRequest["shell"], passwordOverride?: string }>(request)
    if (!body.command?.trim()) {
      respondJson(response, 400, { success: false, error: "command is required" })
      return
    }
    const draft = setCommandDraft(body.command, body.target, body.shell, body.passwordOverride)
    respondJson(response, 200, draft)
    return
  }

  if (method === "POST" && url.pathname === "/api/command/run") {
    const body = await readJsonBody<CommandRunRequest>(request)
    const result = await runCommand(body)
    respondJson(response, result.success ? 200 : 400, result)
    return
  }

  if (method === "GET" && url.pathname === "/api/command/last") {
    respondJson(response, 200, {
      success: true,
      result: getLastCommandResult()
    })
    return
  }

  if (method === "POST" && url.pathname === "/api/command/execute") {
    const body = await readJsonBody<CommandExecutionRequest>(request)
    if (!body.target?.trim() || !body.command?.trim()) {
      respondJson(response, 400, { success: false, error: "target and command are required" })
      return
    }
    const result = await executeCommand({
      target: body.target.trim(),
      shell: body.shell,
      command: body.command,
      passwordOverride: body.passwordOverride
    })
    respondJson(response, result.success ? 200 : 400, result)
    return
  }

  notFound(response)
}

export function startAgentGateway(): void {
  if (gatewayServer) {
    return
  }

  gatewayServer = createServer((request, response) => {
    void handleRequest(request, response).catch((error) => {
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
