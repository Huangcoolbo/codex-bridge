export type ProfilePlatform = "windows" | "android" | "linux"

export interface ProfileSummary {
  name: string
  platform: ProfilePlatform
  transport: string
  target: string
  description?: string | null
}

export interface ProfileDetail {
  name: string
  hostname: string
  username: string
  port: number
  platform: ProfilePlatform
  transport: string
  description?: string | null
  authMethod: "key" | "password"
  keyPath?: string | null
  hasStoredPassword: boolean
}

export interface CurrentTargetSession {
  target: string
  updatedAt: string
}

export interface DashboardSnapshot {
  appName: string
  environment: {
    electron: string
    node: string
    chrome: string
    platform: string
    adbAvailable: boolean
    pythonAvailable: boolean
    defaultWindowsKeyPath: string
    registryPath: string
    projectRoot: string
    agentGatewayPort: number
    agentGatewayUrl: string
  }
  counts: Record<ProfilePlatform, number>
  profiles: ProfileSummary[]
}

export interface AndroidDiscoverySnapshot {
  adbPath: string
  devices: Array<{
    serial: string
    state: string
    details: Record<string, string>
  }>
  services: Array<{
    instanceName: string
    serviceType: string
    address: string
  }>
}

export interface CommandEnvelope {
  success: boolean
  exitCode: number
  stdout: string
  stderr: string
}

export type CommandShell = "powershell" | "cmd" | "bash" | "sh"

export interface CommandDraft {
  target: string
  shell: CommandShell
  command: string
  passwordOverride?: string | null
}

export interface CommandExecutionRequest {
  target: string
  shell?: CommandShell
  command: string
  passwordOverride?: string | null
}

export interface CommandRunRequest {
  target?: string
  shell?: CommandShell
  command?: string
  passwordOverride?: string | null
}

export interface CommandExecutionResult {
  success: boolean
  stdout: string
  stderr: string
  exit_code: number
  target: string
  shell: CommandShell
  command: string
  raw: Record<string, unknown> | null
}

export interface WindowsProfileInput {
  name: string
  hostname: string
  username: string
  port: number
  authMethod: "key" | "password"
  keyPath?: string
  password?: string
  storePassword?: boolean
  description?: string
}

export interface AndroidProfileInput {
  name: string
  serial: string
  description?: string
}

export interface PickedImagePayload {
  name: string
  dataUrl: string
}

export interface AndroidQrPayload {
  rawText: string
  serviceName?: string | null
  password?: string | null
  host?: string | null
  pairingPort?: number | null
  connectPort?: number | null
  pairEndpoint?: string | null
  connectEndpoint?: string | null
}

export interface WindowsDiscoveryCandidate {
  id: string
  label: string
  hostname: string
  port: number
  username?: string | null
  authMethod?: "key" | "password" | null
  keyPath?: string | null
  description?: string | null
  source: "registry" | "sshConfig" | "scan" | "resolved"
}

export interface WindowsDiscoverySnapshot {
  query: string
  scannedRange: string | null
  candidates: WindowsDiscoveryCandidate[]
}

export interface RendererApi {
  loadDashboard: () => Promise<DashboardSnapshot>
  loadProfile: (name: string) => Promise<ProfileDetail | null>
  deleteProfile: (name: string) => Promise<boolean>
  setCurrentTarget: (target: string) => Promise<CurrentTargetSession | null>
  clearCurrentTarget: () => Promise<boolean>
  discoverAndroid: (adbPath?: string) => Promise<AndroidDiscoverySnapshot>
  pairAndroid: (endpoint: string, code: string, adbPath?: string) => Promise<CommandEnvelope>
  connectAndroid: (endpoint: string, adbPath?: string) => Promise<CommandEnvelope>
  disconnectAndroid: (endpoint?: string, adbPath?: string) => Promise<CommandEnvelope>
  saveAndroidProfile: (input: AndroidProfileInput) => Promise<ProfileSummary>
  saveWindowsProfile: (input: WindowsProfileInput) => Promise<ProfileSummary>
  probeProfile: (name: string, passwordOverride?: string) => Promise<Record<string, unknown>>
  executeProfile: (name: string, command: string, passwordOverride?: string) => Promise<Record<string, unknown>>
  setCommand: (command: string, target?: string, shell?: CommandShell, passwordOverride?: string) => Promise<CommandDraft>
  runCommand: (input?: CommandRunRequest) => Promise<CommandExecutionResult>
  getLastResult: () => Promise<CommandExecutionResult | null>
  executeCommand: (input: CommandExecutionRequest) => Promise<CommandExecutionResult>
  discoverWindows: (query?: string) => Promise<WindowsDiscoverySnapshot>
  pickFile: () => Promise<string | null>
  pickQrImage: () => Promise<PickedImagePayload | null>
}
