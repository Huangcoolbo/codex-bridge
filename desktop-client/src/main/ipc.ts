import { dialog, ipcMain, BrowserWindow } from "electron"
import { extname } from "node:path"
import { readFileSync } from "node:fs"

import type {
  AndroidProfileInput,
  CommandExecutionRequest,
  CommandRunRequest,
  PickedImagePayload,
  WindowsProfileInput
} from "@shared/contracts"
import { discoverAndroid, disconnectAndroid, pairAndroid, connectAndroid } from "./services/androidService"
import {
  executeCommand,
  getLastCommandResult,
  runCommand,
  setCommandDraft
} from "./services/automationService"
import {
  deleteProfile,
  discoverWindows,
  executeProfile,
  loadDashboard,
  loadProfile,
  probeWindowsDraft,
  probeProfile,
  saveAndroidProfile,
  saveWindowsProfile
} from "./services/bridgeService"
import { clearCurrentTarget, setCurrentTarget } from "./services/sessionService"

function mimeTypeForExtension(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg"
    case ".webp":
      return "image/webp"
    case ".gif":
      return "image/gif"
    default:
      return "image/png"
  }
}

async function pickImagePayload(window: BrowserWindow): Promise<PickedImagePayload | null> {
  const result = await dialog.showOpenDialog(window, {
    title: "Choose QR Image",
    properties: ["openFile"],
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }]
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  const filePath = result.filePaths[0]
  const buffer = readFileSync(filePath)
  return {
    name: filePath.split(/[\\/]/).pop() ?? "qr-image",
    dataUrl: `data:${mimeTypeForExtension(filePath)};base64,${buffer.toString("base64")}`
  }
}

export function registerIpcHandlers(window: BrowserWindow): void {
  ipcMain.handle("dashboard:load", async () => loadDashboard())
  ipcMain.handle("profile:load", async (_event, name: string) => loadProfile(name))
  ipcMain.handle("profile:delete", async (_event, name: string) => deleteProfile(name))
  ipcMain.handle("session:setCurrentTarget", async (_event, target: string) => target?.trim() ? setCurrentTarget(target) : null)
  ipcMain.handle("session:clearCurrentTarget", async () => {
    clearCurrentTarget()
    return true
  })
  ipcMain.handle("android:discover", async (_event, adbPath?: string) => discoverAndroid(adbPath))
  ipcMain.handle("android:pair", async (_event, endpoint: string, code: string, adbPath?: string) => pairAndroid(endpoint, code, adbPath))
  ipcMain.handle("android:connect", async (_event, endpoint: string, adbPath?: string) => connectAndroid(endpoint, adbPath))
  ipcMain.handle("android:disconnect", async (_event, endpoint?: string, adbPath?: string) => disconnectAndroid(endpoint, adbPath))
  ipcMain.handle("profile:saveAndroid", async (_event, input: AndroidProfileInput) => saveAndroidProfile(input))
  ipcMain.handle("profile:saveWindows", async (_event, input: WindowsProfileInput) => saveWindowsProfile(input))
  ipcMain.handle("profile:probe", async (_event, name: string, passwordOverride?: string) => probeProfile(name, passwordOverride))
  ipcMain.handle("profile:probeWindowsDraft", async (_event, input: WindowsProfileInput) => probeWindowsDraft(input))
  ipcMain.handle("profile:execute", async (_event, name: string, command: string, passwordOverride?: string) => executeProfile(name, command, passwordOverride))
  ipcMain.handle("automation:setCommand", async (_event, command: string, target?: string, shell?: CommandExecutionRequest["shell"], passwordOverride?: string) =>
    setCommandDraft(command, target, shell, passwordOverride)
  )
  ipcMain.handle("automation:runCommand", async (_event, input?: CommandRunRequest) => runCommand(input))
  ipcMain.handle("automation:getLastResult", async () => getLastCommandResult())
  ipcMain.handle("automation:executeCommand", async (_event, input: CommandExecutionRequest) => executeCommand(input))
  ipcMain.handle("windows:discover", async (_event, query?: string) => discoverWindows(query))
  ipcMain.handle("dialog:pickFile", async () => {
    const result = await dialog.showOpenDialog(window, {
      title: "Choose SSH Key",
      properties: ["openFile"]
    })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return result.filePaths[0]
  })
  ipcMain.handle("dialog:pickQrImage", async () => pickImagePayload(window))
}
