import { contextBridge, ipcRenderer } from "electron"

import type {
  CommandDraft,
  CommandExecutionRequest,
  CommandExecutionResult,
  CommandRunRequest,
  CommandShell,
  RendererApi
} from "@shared/contracts"

const automationDraftEvent = "bridge:automation-draft"
const automationStartEvent = "bridge:automation-command-start"
const automationFinishEvent = "bridge:automation-command-finish"

function dispatchAutomationEvent<T>(name: string, detail: T): void {
  window.dispatchEvent(new CustomEvent(name, { detail }))
}

const api: RendererApi = {
  loadDashboard: () => ipcRenderer.invoke("dashboard:load"),
  loadProfile: (name: string) => ipcRenderer.invoke("profile:load", name),
  deleteProfile: (name: string) => ipcRenderer.invoke("profile:delete", name),
  setCurrentTarget: (target: string) => ipcRenderer.invoke("session:setCurrentTarget", target),
  clearCurrentTarget: () => ipcRenderer.invoke("session:clearCurrentTarget"),
  discoverAndroid: (adbPath?: string) => ipcRenderer.invoke("android:discover", adbPath),
  pairAndroid: (endpoint: string, code: string, adbPath?: string) => ipcRenderer.invoke("android:pair", endpoint, code, adbPath),
  connectAndroid: (endpoint: string, adbPath?: string) => ipcRenderer.invoke("android:connect", endpoint, adbPath),
  disconnectAndroid: (endpoint?: string, adbPath?: string) => ipcRenderer.invoke("android:disconnect", endpoint, adbPath),
  saveAndroidProfile: (input) => ipcRenderer.invoke("profile:saveAndroid", input),
  saveWindowsProfile: (input) => ipcRenderer.invoke("profile:saveWindows", input),
  probeProfile: (name: string, passwordOverride?: string) => ipcRenderer.invoke("profile:probe", name, passwordOverride),
  probeWindowsDraft: (input) => ipcRenderer.invoke("profile:probeWindowsDraft", input),
  executeProfile: (name: string, command: string, passwordOverride?: string) => ipcRenderer.invoke("profile:execute", name, command, passwordOverride),
  setCommand: async (command: string, target?: string, shell?: CommandShell, passwordOverride?: string) => {
    const draft = await ipcRenderer.invoke("automation:setCommand", command, target, shell, passwordOverride) as CommandDraft
    dispatchAutomationEvent(automationDraftEvent, draft)
    return draft
  },
  runCommand: async (input?: CommandRunRequest) => {
    if (input) {
      dispatchAutomationEvent(automationStartEvent, input)
    }
    const result = await ipcRenderer.invoke("automation:runCommand", input) as CommandExecutionResult
    dispatchAutomationEvent(automationFinishEvent, result)
    return result
  },
  getLastResult: () => ipcRenderer.invoke("automation:getLastResult"),
  executeCommand: async (input: CommandExecutionRequest) => {
    dispatchAutomationEvent(automationStartEvent, input)
    const result = await ipcRenderer.invoke("automation:executeCommand", input) as CommandExecutionResult
    dispatchAutomationEvent(automationDraftEvent, {
      target: input.target,
      shell: input.shell ?? "powershell",
      command: input.command,
      passwordOverride: input.passwordOverride ?? null
    } satisfies CommandDraft)
    dispatchAutomationEvent(automationFinishEvent, result)
    return result
  },
  discoverWindows: (query?: string) => ipcRenderer.invoke("windows:discover", query),
  pickFile: () => ipcRenderer.invoke("dialog:pickFile"),
  pickQrImage: () => ipcRenderer.invoke("dialog:pickQrImage")
}

contextBridge.exposeInMainWorld("bridgeDesktop", api)
