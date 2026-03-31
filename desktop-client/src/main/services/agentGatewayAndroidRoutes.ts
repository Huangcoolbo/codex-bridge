import {
  clearCurrentAndroidSelection,
  executeAndroidSafeShell,
  getAndroidDeviceInfo,
  getCurrentAndroidSelection,
  listAndroidDevices,
  listAndroidFiles,
  mkdirAndroidDirectory,
  pullAndroidFile,
  pushAndroidFile,
  readAndroidFile,
  setCurrentAndroidSelection,
  writeAndroidFile
} from "./androidGatewayService"
import { attachGatewayDiagnosis } from "./agentGatewayDiagnosticsCore"
import {
  badRequest,
  readBody,
  respondWithResult,
  successEnvelope,
  successErrorEnvelope,
  type GatewayRouteDefinition
} from "./agentGatewayHttp"

export const androidRoutes: GatewayRouteDefinition[] = [
  {
    method: "GET",
    path: "/api/android/devices",
    handler: async ({ response }) => {
      const result = await listAndroidDevices()
      respondWithResult(response, attachGatewayDiagnosis("android-discover", result))
    }
  },
  {
    method: "GET",
    path: "/api/android/current",
    handler: ({ response }) => {
      respondWithResult(response, successEnvelope({ current: getCurrentAndroidSelection() }))
    }
  },
  {
    method: "POST",
    path: "/api/android/current",
    handler: async (context) => {
      const body = await readBody<{ serial?: string }>(context)
      const serial = body.serial?.trim()
      if (!serial) {
        throw badRequest(successErrorEnvelope("serial is required"))
      }
      respondWithResult(context.response, successEnvelope({ current: setCurrentAndroidSelection(serial) }))
    }
  },
  {
    method: "DELETE",
    path: "/api/android/current",
    handler: ({ response }) => {
      clearCurrentAndroidSelection()
      respondWithResult(response, successEnvelope({ current: null }))
    }
  },
  {
    method: "GET",
    path: "/api/android/devices/:serial/info",
    handler: async ({ response, params }) => {
      const result = await getAndroidDeviceInfo(params.serial)
      respondWithResult(response, attachGatewayDiagnosis("android-device-info", result, { serial: params.serial }))
    }
  },
  {
    method: "POST",
    path: "/api/android/devices/:serial/shell/execute",
    handler: async (context) => {
      const body = await readBody<{ command?: string }>(context)
      const result = await executeAndroidSafeShell(context.params.serial, body.command ?? "")
      respondWithResult(context.response, attachGatewayDiagnosis("android-shell", result, { serial: context.params.serial }))
    }
  },
  {
    method: "POST",
    path: "/api/android/devices/:serial/files/list",
    handler: async (context) => {
      const body = await readBody<{ path?: string }>(context)
      const result = await listAndroidFiles(context.params.serial, body.path ?? "")
      respondWithResult(context.response, attachGatewayDiagnosis("android-files-list", result, { serial: context.params.serial }))
    }
  },
  {
    method: "POST",
    path: "/api/android/devices/:serial/files/mkdir",
    handler: async (context) => {
      const body = await readBody<{ path?: string, recursive?: boolean }>(context)
      const result = await mkdirAndroidDirectory(context.params.serial, body.path ?? "", body.recursive ?? true)
      respondWithResult(context.response, attachGatewayDiagnosis("android-files-mkdir", result, { serial: context.params.serial }))
    }
  },
  {
    method: "POST",
    path: "/api/android/devices/:serial/files/read",
    handler: async (context) => {
      const body = await readBody<{ path?: string, encoding?: string }>(context)
      const result = await readAndroidFile(context.params.serial, body.path ?? "", body.encoding ?? "utf-8")
      respondWithResult(context.response, attachGatewayDiagnosis("android-files-read", result, { serial: context.params.serial }))
    }
  },
  {
    method: "POST",
    path: "/api/android/devices/:serial/files/write",
    handler: async (context) => {
      const body = await readBody<{
        path?: string
        content?: string
        mode?: string
        create_if_missing?: boolean
        createIfMissing?: boolean
        encoding?: string
      }>(context)
      const result = await writeAndroidFile(context.params.serial, body)
      respondWithResult(context.response, attachGatewayDiagnosis("android-files-write", result, { serial: context.params.serial }))
    }
  },
  {
    method: "POST",
    path: "/api/android/devices/:serial/files/push",
    handler: async (context) => {
      const body = await readBody<{
        localPath?: string
        remotePath?: string
        path?: string
        overwrite?: boolean
      }>(context)
      const result = await pushAndroidFile(context.params.serial, body)
      respondWithResult(context.response, attachGatewayDiagnosis("android-files-push", result, { serial: context.params.serial }))
    }
  },
  {
    method: "POST",
    path: "/api/android/devices/:serial/files/pull",
    handler: async (context) => {
      const body = await readBody<{ path?: string, localPath?: string }>(context)
      const result = await pullAndroidFile(context.params.serial, body.path ?? "", body.localPath)
      respondWithResult(context.response, attachGatewayDiagnosis("android-files-pull", result, { serial: context.params.serial }))
    }
  }
]
