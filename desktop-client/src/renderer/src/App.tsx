import { useEffect, useMemo, useRef, useState, type CSSProperties, type JSX } from "react"

import type {
  AndroidDiscoverySnapshot,
  AndroidProfileInput,
  CommandDraft,
  CommandExecutionResult,
  DashboardSnapshot,
  ProfileDetail,
  ProfilePlatform,
  ProfileSummary,
  WindowsDiscoveryCandidate,
  WindowsDiscoverySnapshot,
  WindowsProfileInput
} from "@shared/contracts"
import { COPY, detectInitialLocale, detectInitialTheme, type Locale, type SectionId, type ThemeMode } from "./locales"

type LatestTaskState = {
  label: string
  status: "idle" | "running" | "success" | "error"
}
type TopbarToneState = "idle" | "success" | "error"
type SectionProfileState = Record<ProfilePlatform, string>
type BridgeAutomationDraftEvent = CustomEvent<CommandDraft>
type BridgeAutomationResultEvent = CustomEvent<CommandExecutionResult>
type AndroidTargetMode = "wireless" | "usb"
type AndroidWirelessState =
  | "idle"
  | "pair-ready"
  | "pairing"
  | "paired"
  | "endpoint-ready"
  | "connecting"
  | "connected"
  | "stale-endpoint"
  | "repair-required"
  | "error"
type AndroidEndpointSource = "none" | "service" | "connected-device" | "remembered"
type AndroidConnectFailureKind = "stale-endpoint" | "repair-required" | "unknown"

const automationDraftEvent = "bridge:automation-draft"
const automationStartEvent = "bridge:automation-command-start"
const automationFinishEvent = "bridge:automation-command-finish"
const androidEndpointMemoryKey = "bridge-android-connect-endpoints"

function safeStringify(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2)
}

function normalizeProfileName(value: string): string {
  const normalized = value.trim().replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")
  return normalized || "host"
}

function isFailedResult(result: unknown): boolean {
  if (!result || typeof result !== "object") {
    return false
  }
  const envelope = result as Record<string, unknown>
  if (typeof envelope.success === "boolean") {
    return envelope.success === false
  }
  if (typeof envelope.exitCode === "number") {
    return envelope.exitCode !== 0
  }
  if (typeof envelope.exit_code === "number") {
    return envelope.exit_code !== 0
  }
  return false
}

function formatTaskLabel(label: string, status: LatestTaskState["status"], locale: Locale): string {
  if (status === "idle" || status === "running") {
    return label
  }

  const suffix = status === "success" ? "成功" : "失败"

  if (locale === "zh") {
    const base = label.endsWith("中") ? label.slice(0, -1) : label
    return `${base}${suffix}`
  }

  return `${label} ${status === "success" ? "succeeded" : "failed"}`
}

function sourceLabel(copy: (typeof COPY)[Locale], source: WindowsDiscoveryCandidate["source"]): string {
  switch (source) {
    case "registry":
      return copy.windows.sourceRegistry
    case "sshConfig":
      return copy.windows.sourceSsh
    case "scan":
      return copy.windows.sourceScan
    case "resolved":
      return copy.windows.sourceResolved
    default:
      return source
  }
}

function extractHostFromEndpoint(endpoint: string): string | null {
  const trimmed = endpoint.trim()
  if (!trimmed) {
    return null
  }
  const separatorIndex = trimmed.lastIndexOf(":")
  if (separatorIndex <= 0) {
    return null
  }
  const host = trimmed.slice(0, separatorIndex).trim()
  return host || null
}

function parseConnectEndpointFromOutput(stdout: string): string | null {
  const match = stdout.match(/\b(?:already connected to|connected to)\s+([^\s\r\n]+)/i)
  return match?.[1]?.trim() || null
}

function loadRememberedAndroidEndpoints(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(androidEndpointMemoryKey)
    if (!raw) {
      return {}
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[0] === "string" && typeof entry[1] === "string")
    )
  } catch {
    return {}
  }
}

function rememberAndroidConnectEndpoint(endpoint: string): void {
  const host = extractHostFromEndpoint(endpoint)
  if (!host) {
    return
  }
  const current = loadRememberedAndroidEndpoints()
  current[host] = endpoint.trim()
  window.localStorage.setItem(androidEndpointMemoryKey, JSON.stringify(current))
}

function getRememberedAndroidConnectEndpoint(endpointLike: string): string | null {
  const host = extractHostFromEndpoint(endpointLike)
  if (!host) {
    return null
  }
  return loadRememberedAndroidEndpoints()[host] ?? null
}

function forgetAndroidConnectEndpoint(endpointLike: string): void {
  const host = extractHostFromEndpoint(endpointLike)
  if (!host) {
    return
  }
  const current = loadRememberedAndroidEndpoints()
  if (!(host in current)) {
    return
  }
  delete current[host]
  window.localStorage.setItem(androidEndpointMemoryKey, JSON.stringify(current))
}

function inferAndroidConnectEndpoint(snapshot: AndroidDiscoverySnapshot, preferredHost?: string | null): {
  endpoint: string | null
  source: AndroidEndpointSource
} {
  const connectService = snapshot.services.find((service) => service.serviceType.includes("connect") && service.address.trim())
  if (connectService?.address) {
    return {
      endpoint: connectService.address.trim(),
      source: "service"
    }
  }

  const wirelessDevices = snapshot.devices.filter((device) => device.state === "device" && device.serial.includes(":"))
  if (preferredHost) {
    const preferredDevice = wirelessDevices.find((device) => extractHostFromEndpoint(device.serial) === preferredHost)
    if (preferredDevice) {
      return {
        endpoint: preferredDevice.serial.trim(),
        source: "connected-device"
      }
    }
  }

  if (wirelessDevices[0]?.serial?.trim()) {
    return {
      endpoint: wirelessDevices[0].serial.trim(),
      source: "connected-device"
    }
  }

  return {
    endpoint: null,
    source: "none"
  }
}

function classifyAndroidConnectFailure(stdout: string, stderr: string): AndroidConnectFailureKind {
  const text = `${stdout}\n${stderr}`.toLowerCase()

  if (
    /failed to authenticate to|authentication failed|pairing/i.test(text)
    || /unauthorized/.test(text)
  ) {
    return "repair-required"
  }

  if (
    /cannot connect to|failed to connect to|unable to connect to/.test(text)
    || /10061/.test(text)
    || /actively refused/.test(text)
  ) {
    return "stale-endpoint"
  }

  return "unknown"
}

function describeAndroidWirelessState(copy: (typeof COPY)[Locale], state: AndroidWirelessState): {
  label: string
  description: string
  tone: "neutral" | "success" | "warning" | "danger"
} {
  switch (state) {
    case "pair-ready":
      return { label: copy.android.statePairReady, description: copy.android.statePairReadyDescription, tone: "neutral" }
    case "pairing":
      return { label: copy.android.statePairing, description: copy.android.statePairingDescription, tone: "neutral" }
    case "paired":
      return { label: copy.android.statePaired, description: copy.android.statePairedDescription, tone: "neutral" }
    case "endpoint-ready":
      return { label: copy.android.stateEndpointReady, description: copy.android.stateEndpointReadyDescription, tone: "neutral" }
    case "connecting":
      return { label: copy.android.stateConnecting, description: copy.android.stateConnectingDescription, tone: "neutral" }
    case "connected":
      return { label: copy.android.stateConnected, description: copy.android.stateConnectedDescription, tone: "success" }
    case "stale-endpoint":
      return { label: copy.android.stateStaleEndpoint, description: copy.android.stateStaleEndpointDescription, tone: "warning" }
    case "repair-required":
      return { label: copy.android.stateRepairRequired, description: copy.android.stateRepairRequiredDescription, tone: "danger" }
    case "error":
      return { label: copy.android.stateError, description: copy.android.stateErrorDescription, tone: "danger" }
    case "idle":
    default:
      return { label: copy.android.stateIdle, description: copy.android.stateIdleDescription, tone: "neutral" }
  }
}

export default function App(): JSX.Element {
  const [locale, setLocale] = useState<Locale>(() => detectInitialLocale())
  const [theme, setTheme] = useState<ThemeMode>(() => detectInitialTheme())
  const [settingsOpen, setSettingsOpen] = useState(false)
  const copy = COPY[locale]
  const [activeSection, setActiveSection] = useState<SectionId>("overview")
  const [dashboard, setDashboard] = useState<DashboardSnapshot | null>(null)
  const [androidDiscovery, setAndroidDiscovery] = useState<AndroidDiscoverySnapshot | null>(null)
  const [windowsDiscovery, setWindowsDiscovery] = useState<WindowsDiscoverySnapshot | null>(null)
  const [logLines, setLogLines] = useState<string[]>([])

  const [adbPath, setAdbPath] = useState("")
  const [pairEndpoint, setPairEndpoint] = useState("")
  const [pairCode, setPairCode] = useState("")
  const [connectEndpoint, setConnectEndpoint] = useState("")
  const [androidProfileName, setAndroidProfileName] = useState("pixel-air")
  const [androidDescription, setAndroidDescription] = useState("")
  const [androidQrStatus, setAndroidQrStatus] = useState("")
  const [androidWirelessState, setAndroidWirelessState] = useState<AndroidWirelessState>("idle")
  const [androidTargetMode, setAndroidTargetMode] = useState<AndroidTargetMode>("wireless")
  const [selectedAndroidUsbSerial, setSelectedAndroidUsbSerial] = useState("")

  const [windowsQuery, setWindowsQuery] = useState("")
  const [selectedWindowsCandidateId, setSelectedWindowsCandidateId] = useState("")
  const [windowsName, setWindowsName] = useState("lab-win")
  const [windowsHost, setWindowsHost] = useState("")
  const [windowsPort, setWindowsPort] = useState("22")
  const [windowsUser, setWindowsUser] = useState("")
  const [windowsAuthMethod, setWindowsAuthMethod] = useState<"key" | "password">("key")
  const [windowsKeyPath, setWindowsKeyPath] = useState("")
  const [windowsPassword, setWindowsPassword] = useState("")
  const [windowsStorePassword, setWindowsStorePassword] = useState(false)
  const [windowsDescription, setWindowsDescription] = useState("")
  const [windowsCommand, setWindowsCommand] = useState("Get-Process | Select-Object -First 5")
  const [selectedProfiles, setSelectedProfiles] = useState<SectionProfileState>({ windows: "", android: "", linux: "" })
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [latestTask, setLatestTask] = useState<LatestTaskState>({ label: copy.inspector.taskReady, status: "idle" })
  const [topbarTask, setTopbarTask] = useState<LatestTaskState>({ label: copy.inspector.taskReady, status: "idle" })
  const [topbarTone, setTopbarTone] = useState<TopbarToneState>("idle")
  const [topbarWarmFlash, setTopbarWarmFlash] = useState(false)
  const [validatedWindowsSignature, setValidatedWindowsSignature] = useState("")
  const profileMenuRef = useRef<HTMLDivElement | null>(null)
  const workspaceRef = useRef<HTMLElement | null>(null)
  const [workspaceScrollTop, setWorkspaceScrollTop] = useState(0)

  useEffect(() => {
    window.localStorage.setItem("bridge-workbench-locale", locale)
    setLatestTask((current) => current.status === "idle" ? { label: copy.inspector.taskReady, status: "idle" } : current)
    setTopbarTask((current) => current.status === "idle" ? { label: copy.inspector.taskReady, status: "idle" } : current)
    setTopbarTone((current) => current === "idle" ? "idle" : current)
  }, [locale, copy.inspector.taskReady])

  useEffect(() => {
    window.localStorage.setItem("bridge-workbench-theme", theme)
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    if (latestTask.status === "running") {
      setTopbarWarmFlash(false)
      setTopbarTask(latestTask)
      return
    }

    if (latestTask.status === "idle") {
      setTopbarWarmFlash(false)
      setTopbarTask(latestTask)
      setTopbarTone("idle")
      return
    }

    setTopbarWarmFlash(true)
    const swapTimeoutId = window.setTimeout(() => {
      setTopbarTask(latestTask)
      setTopbarTone(latestTask.status === "error" ? "error" : "success")
    }, 530)
    const timeoutId = window.setTimeout(() => {
      setTopbarWarmFlash(false)
    }, 2200)

    return () => {
      window.clearTimeout(swapTimeoutId)
      window.clearTimeout(timeoutId)
    }
  }, [latestTask])

  const savedProfiles = dashboard?.profiles ?? []
  const activeProfilePlatform = activeSection === "windows" || activeSection === "android" || activeSection === "linux"
    ? activeSection
    : null
  const selectedProfile = activeProfilePlatform ? selectedProfiles[activeProfilePlatform] : ""
  const selectedProfileSummary = useMemo(
    () => activeProfilePlatform
      ? savedProfiles.find((profile) => profile.name === selectedProfiles[activeProfilePlatform] && profile.platform === activeProfilePlatform) ?? null
      : null,
    [activeProfilePlatform, savedProfiles, selectedProfiles]
  )
  const profileOptions = useMemo(() => {
    if (activeProfilePlatform) {
      return savedProfiles.filter((profile) => profile.platform === activeProfilePlatform)
    }
    return []
  }, [activeProfilePlatform, savedProfiles])
  const androidProfiles = savedProfiles.filter((profile) => profile.platform === "android")
  const androidDevices = androidDiscovery?.devices ?? []
  const androidServices = androidDiscovery?.services ?? []
  const androidUsbDevices = androidDevices.filter((device) => device.serial.trim().length > 0)
  const selectedAndroidUsbDevice = androidUsbDevices.find((device) => device.serial === selectedAndroidUsbSerial) ?? null
  const hasActiveAndroidSession = androidDevices.some((device) => device.state === "device")
  const canPairAndroid = pairEndpoint.trim().length > 0 && pairCode.trim().length > 0
  const canConnectAndroid = connectEndpoint.trim().length > 0
  const androidWirelessTarget = connectEndpoint.trim()
  const androidSaveTarget = androidTargetMode === "usb"
    ? selectedAndroidUsbSerial.trim()
    : androidWirelessTarget
  const canSaveAndroid = androidProfileName.trim().length > 0 && androidSaveTarget.length > 0
  const androidWirelessStateView = describeAndroidWirelessState(copy, androidWirelessState)
  const canPrepareAndroidWireless = androidWirelessState !== "pairing" && androidWirelessState !== "connecting"
  const canDiscoverAndroidWireless = androidWirelessState !== "pairing" && androidWirelessState !== "connecting"
  const canRunAndroidPair = canPairAndroid && canPrepareAndroidWireless && (
    androidWirelessState === "pair-ready"
    || androidWirelessState === "repair-required"
    || androidWirelessState === "error"
  )
  const canRunAndroidConnect = canConnectAndroid && androidWirelessState === "endpoint-ready"
  const canRunAndroidDisconnect = hasActiveAndroidSession && androidWirelessState === "connected"
  const discoverButtonClassName = androidWirelessState === "paired" || androidWirelessState === "stale-endpoint"
    ? "primary-button"
    : "ghost-button"
  const pairButtonClassName = androidWirelessState === "pair-ready" || androidWirelessState === "repair-required"
    ? "primary-button"
    : "ghost-button"
  const connectButtonClassName = androidWirelessState === "endpoint-ready"
    ? "primary-button"
    : "ghost-button"
  const defaultWindowsKeyPath = dashboard?.environment.defaultWindowsKeyPath ?? ""
  const topbarProgress = Math.min(workspaceScrollTop / 92, 1)
  const isTopbarSplit = topbarProgress > 0.08
  const windowsDraftSignature = JSON.stringify({
    hostname: windowsHost.trim(),
    port: windowsPort.trim() || "22",
    username: windowsUser.trim(),
    authMethod: windowsAuthMethod,
    keyPath: windowsAuthMethod === "key" ? (windowsKeyPath.trim() || defaultWindowsKeyPath) : "",
    hasPassword: windowsAuthMethod === "password" ? Boolean(windowsPassword.trim()) : false
  })
  const canProbeWindows = Boolean(
    (selectedProfile && selectedProfileSummary?.platform === "windows") ||
    (windowsHost.trim() && windowsUser.trim() && (windowsAuthMethod === "password" ? windowsPassword.trim() : (windowsKeyPath.trim() || defaultWindowsKeyPath)))
  )
  const canSaveWindows = Boolean(selectedProfile || validatedWindowsSignature === windowsDraftSignature)
  const topbarTaskDisplayLabel = formatTaskLabel(topbarTask.label, topbarTask.status, locale)
  const topbarStatusText = topbarTask.status === "idle" ? copy.toolbar.ready : topbarTaskDisplayLabel
  const topbarStatusClass = topbarTone === "error"
    ? "topbar-status is-failed"
    : topbarTone === "success"
      ? "topbar-status is-success"
      : "topbar-status"
  const topbarStatusClassName = topbarWarmFlash ? `${topbarStatusClass} is-warm` : topbarStatusClass
  const compactStatusClass = topbarTone === "error"
    ? "topbar-status-compact is-failed"
    : topbarTone === "success"
      ? "topbar-status-compact is-success"
      : "topbar-status-compact"
  const compactStatusClassName = topbarWarmFlash ? `${compactStatusClass} is-warm` : compactStatusClass
  const topbarSurprise = topbarTone === "error"
    ? (locale === "zh" ? "目标还在前面，桥先替你记住这次偏差。" : "The goal is still ahead. The bridge will hold onto this deviation for the next try.")
    : locale === "zh"
      ? "再往下滑一点，桥会退到幕后，让目标与动作在这里彼此匹配。"
      : "Scroll a little further. The bridge steps aside so intent and target can meet here."
  const topbarSurpriseClass = topbarTone === "error"
    ? "topbar-surprise-chip is-failed"
    : "topbar-surprise-chip"
  const topbarSurpriseClassName = topbarWarmFlash ? `${topbarSurpriseClass} is-warm` : topbarSurpriseClass
  const brandLogoClassName = topbarWarmFlash ? "brand-logo is-warm" : "brand-logo"
  const topbarStyle = {
    ["--topbar-progress" as string]: topbarProgress.toString()
  } as CSSProperties
  const windowsDraftTarget = windowsHost.trim()
    ? `${windowsUser.trim() ? `${windowsUser.trim()}@` : ""}${windowsHost.trim()}:${windowsPort.trim() || "22"}`
    : copy.inspector.noneDescription
  const androidDraftTarget = androidTargetMode === "usb"
    ? (selectedAndroidUsbSerial.trim() || copy.inspector.noneDescription)
    : (connectEndpoint.trim() || pairEndpoint.trim() || copy.inspector.noneDescription)
  const currentTargetLabel = selectedProfileSummary?.target
    ?? (activeSection === "windows"
      ? windowsDraftTarget
      : activeSection === "android"
        ? androidDraftTarget
        : copy.inspector.noneDescription)
  const overviewCards = dashboard
    ? [
        { label: copy.overview.cards.windowsHosts, value: dashboard.counts.windows },
        { label: copy.overview.cards.androidDevices, value: dashboard.counts.android },
        { label: copy.overview.cards.linuxPlaceholders, value: dashboard.counts.linux },
        { label: copy.overview.cards.registryFile, value: dashboard.environment.registryPath }
      ]
    : []

  useEffect(() => {
    const preferredUsbDevice = androidUsbDevices.find((device) => device.state === "device") ?? androidUsbDevices[0] ?? null
    if (!preferredUsbDevice) {
      if (selectedAndroidUsbSerial) {
        setSelectedAndroidUsbSerial("")
      }
      return
    }

    if (!selectedAndroidUsbSerial || !androidUsbDevices.some((device) => device.serial === selectedAndroidUsbSerial)) {
      setSelectedAndroidUsbSerial(preferredUsbDevice.serial)
    }
  }, [androidUsbDevices, selectedAndroidUsbSerial])

  useEffect(() => {
    if (!androidDiscovery) {
      return
    }

    const pairService = androidDiscovery.services.find((service) => service.serviceType.includes("pair"))
    const inferredConnectEndpoint = inferAndroidConnectEndpoint(
      androidDiscovery,
      extractHostFromEndpoint(connectEndpoint) ?? extractHostFromEndpoint(pairEndpoint)
    )

    if (pairService && !pairEndpoint.trim()) {
      setPairEndpoint(pairService.address)
    }

    if (inferredConnectEndpoint.endpoint && inferredConnectEndpoint.endpoint !== connectEndpoint.trim()) {
      setConnectEndpoint(inferredConnectEndpoint.endpoint)
      rememberAndroidConnectEndpoint(inferredConnectEndpoint.endpoint)
    }

    if (inferredConnectEndpoint.endpoint) {
      setAndroidWirelessState(inferredConnectEndpoint.source === "connected-device" ? "connected" : "endpoint-ready")
      setAndroidQrStatus(copy.android.qrDetectedLive)
      return
    }

    if (!androidQrStatus) {
      setAndroidQrStatus(copy.android.qrReady)
    }
    if (androidWirelessState === "idle" && pairEndpoint.trim() && pairCode.trim()) {
      setAndroidWirelessState("pair-ready")
    }
  }, [androidDiscovery, pairEndpoint, pairCode, connectEndpoint, androidQrStatus, androidWirelessState, copy.android.qrDetectedLive, copy.android.qrReady])

  useEffect(() => {
    if (connectEndpoint.trim() || !pairEndpoint.trim()) {
      return
    }

    const remembered = getRememberedAndroidConnectEndpoint(pairEndpoint)
    if (remembered) {
      setConnectEndpoint(remembered)
      setAndroidWirelessState("endpoint-ready")
      setAndroidQrStatus(copy.android.qrDetectedRemembered)
    }
  }, [pairEndpoint, connectEndpoint, copy.android.qrDetectedRemembered])

  useEffect(() => {
    if (latestTask.status === "running") {
      return
    }

    if (androidWirelessState === "stale-endpoint" || androidWirelessState === "repair-required" || androidWirelessState === "error") {
      return
    }

    if (androidDiscovery?.devices.some((device) => device.state === "device" && device.serial.includes(":"))) {
      if (androidWirelessState !== "connected") {
        setAndroidWirelessState("connected")
      }
      return
    }

    if (connectEndpoint.trim()) {
      if (androidWirelessState !== "endpoint-ready") {
        setAndroidWirelessState("endpoint-ready")
      }
      return
    }

    if (pairEndpoint.trim() && pairCode.trim()) {
      if (androidWirelessState !== "pair-ready") {
        setAndroidWirelessState("pair-ready")
      }
      return
    }

    if (androidWirelessState !== "idle") {
      setAndroidWirelessState("idle")
    }
  }, [pairEndpoint, pairCode, connectEndpoint, androidDiscovery, latestTask.status, androidWirelessState])

  function setPlatformSelection(platform: ProfilePlatform, name: string): void {
    setSelectedProfiles((current) => ({ ...current, [platform]: name }))
  }

  function beginWindowsConnectionDraft(): void {
    beginWindowsDraft()
    setValidatedWindowsSignature("")
  }

  function applyProfileDetail(detail: ProfileDetail): void {
    if (detail.platform === "windows") {
      setWindowsName(detail.name)
      setWindowsHost(detail.hostname)
      setWindowsPort(String(detail.port))
      setWindowsUser(detail.username)
      setWindowsAuthMethod(detail.authMethod)
      setWindowsKeyPath(detail.keyPath ?? defaultWindowsKeyPath)
      setWindowsDescription(detail.description ?? "")
      setWindowsStorePassword(detail.hasStoredPassword)
      setActiveSection("windows")
      return
    }

    if (detail.platform === "android") {
      setAndroidProfileName(detail.name)
      if (detail.hostname.includes(":")) {
        setAndroidTargetMode("wireless")
        setConnectEndpoint(detail.hostname)
      } else {
        setAndroidTargetMode("usb")
        setSelectedAndroidUsbSerial(detail.hostname)
      }
      setAndroidDescription(detail.description ?? "")
      setActiveSection("android")
    }
  }

  function syncAutomationCommand(target?: string, command?: string): void {
    setActiveSection("windows")
    if (target?.trim()) {
      setPlatformSelection("windows", target.trim())
    }
    if (typeof command === "string") {
      setWindowsCommand(command)
    }
  }

  function beginWindowsDraft(): void {
    if (selectedProfileSummary?.platform === "windows") {
      setPlatformSelection("windows", "")
    }
  }

  function beginAndroidDraft(): void {
    if (selectedProfileSummary?.platform === "android") {
      setPlatformSelection("android", "")
    }
  }

  async function refreshDashboard(): Promise<void> {
    const snapshot = await window.bridgeDesktop.loadDashboard()
    setDashboard(snapshot)
  }

  function appendLog(title: string, payload: unknown): void {
    const stamp = new Date().toLocaleTimeString(locale === "zh" ? "zh-CN" : "en-US")
    setLogLines((current) => [`[${stamp}] ${title}\n${safeStringify(payload)}`, ...current].slice(0, 18))
  }

  async function runTask<T>(label: string, action: () => Promise<T>, onSuccess?: (result: T) => Promise<void> | void): Promise<void> {
    setLatestTask({ label, status: "running" })
    try {
      const result = await action()
      if (isFailedResult(result)) {
        appendLog(`${label} failed`, result)
        setLatestTask({ label, status: "error" })
        return
      }
      await onSuccess?.(result)
      appendLog(label, result)
      setLatestTask({ label, status: "success" })
    } catch (error) {
      appendLog(`${label} failed`, error instanceof Error ? error.message : String(error))
      setLatestTask({ label, status: "error" })
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshDashboard().catch((error) => {
        appendLog(`${copy.loadingDashboard} failed`, error instanceof Error ? error.message : String(error))
        setLatestTask({ label: copy.loadingDashboard, status: "error" })
      })
    }, 0)

    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (windowsAuthMethod === "key" && !windowsKeyPath.trim() && defaultWindowsKeyPath) {
      setWindowsKeyPath(defaultWindowsKeyPath)
    }
  }, [defaultWindowsKeyPath, windowsAuthMethod, windowsKeyPath])

  useEffect(() => {
    if (!profileMenuOpen) {
      return
    }

    const handlePointerDown = (event: MouseEvent): void => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false)
      }
    }

    window.addEventListener("mousedown", handlePointerDown)
    return () => window.removeEventListener("mousedown", handlePointerDown)
  }, [profileMenuOpen])

  useEffect(() => {
    if (!selectedProfile) {
      return
    }

    void window.bridgeDesktop.loadProfile(selectedProfile).then((detail) => {
      if (detail) {
        applyProfileDetail(detail)
      }
    })
  }, [defaultWindowsKeyPath, selectedProfile])

  useEffect(() => {
    if (selectedProfile) {
      void window.bridgeDesktop.setCurrentTarget(selectedProfile)
      return
    }

    if (activeProfilePlatform) {
      void window.bridgeDesktop.clearCurrentTarget()
    }
  }, [activeProfilePlatform, selectedProfile])

  useEffect(() => {
    const workspace = workspaceRef.current
    if (!workspace) {
      return
    }

    const handleScroll = (): void => {
      setWorkspaceScrollTop(workspace.scrollTop)
    }

    handleScroll()
    workspace.addEventListener("scroll", handleScroll, { passive: true })
    return () => workspace.removeEventListener("scroll", handleScroll)
  }, [])

  useEffect(() => {
    const handleAutomationDraft = (event: Event): void => {
      const detail = (event as BridgeAutomationDraftEvent).detail
      syncAutomationCommand(detail.target, detail.command)
    }

    const handleAutomationStart = (event: Event): void => {
      const detail = (event as BridgeAutomationDraftEvent).detail
      syncAutomationCommand(detail.target, detail.command)
      setLatestTask({ label: copy.windows.executing, status: "running" })
    }

    const handleAutomationFinish = (event: Event): void => {
      const detail = (event as BridgeAutomationResultEvent).detail
      syncAutomationCommand(detail.target, detail.command)
      appendLog(copy.windows.executing, detail)
      setLatestTask({ label: copy.windows.executing, status: detail.success ? "success" : "error" })
    }

    window.addEventListener(automationDraftEvent, handleAutomationDraft)
    window.addEventListener(automationStartEvent, handleAutomationStart)
    window.addEventListener(automationFinishEvent, handleAutomationFinish)

    return () => {
      window.removeEventListener(automationDraftEvent, handleAutomationDraft)
      window.removeEventListener(automationStartEvent, handleAutomationStart)
      window.removeEventListener(automationFinishEvent, handleAutomationFinish)
    }
  }, [copy.idle, copy.windows.executing, locale])

  async function handleAndroidDiscover(): Promise<void> {
    await runTask(copy.android.refreshing, () => window.bridgeDesktop.discoverAndroid(adbPath || undefined), (result) => {
      setAndroidDiscovery(result)
      setAdbPath(result.adbPath)
    })
  }

  async function refreshAndroidDiscoverySilently(): Promise<AndroidDiscoverySnapshot> {
    const result = await window.bridgeDesktop.discoverAndroid(adbPath || undefined)
    setAndroidDiscovery(result)
    setAdbPath(result.adbPath)
    return result
  }

  async function waitForAndroidConnectEndpoint(maxAttempts = 6, delayMs = 1500): Promise<string | null> {
    const preferredHost = extractHostFromEndpoint(connectEndpoint) ?? extractHostFromEndpoint(pairEndpoint)
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const snapshot = await refreshAndroidDiscoverySilently()
      const discovery = inferAndroidConnectEndpoint(snapshot, preferredHost)
      if (discovery.endpoint) {
        setConnectEndpoint(discovery.endpoint)
        rememberAndroidConnectEndpoint(discovery.endpoint)
        setAndroidQrStatus(discovery.source === "connected-device" ? copy.android.qrConnected : copy.android.qrDetectedLive)
        return discovery.endpoint
      }

      if (attempt < maxAttempts - 1) {
        await new Promise((resolve) => window.setTimeout(resolve, delayMs))
      }
    }

    return null
  }

  async function handleAndroidPrepareWireless(): Promise<void> {
    setAndroidTargetMode("wireless")
    setAndroidWirelessState(pairEndpoint.trim() && pairCode.trim() ? "pair-ready" : "idle")
    setAndroidQrStatus(copy.android.qrReady)
    appendLog(copy.android.showQr, copy.android.qrReady)
    if (!androidDiscovery) {
      await handleAndroidDiscover()
    }
  }

  async function handleAndroidPair(): Promise<void> {
    setAndroidTargetMode("wireless")
    setAndroidWirelessState("pairing")
    setLatestTask({ label: copy.android.pairing, status: "running" })
    try {
      const pairResult = await window.bridgeDesktop.pairAndroid(pairEndpoint, pairCode, adbPath || undefined)
      if (isFailedResult(pairResult)) {
        appendLog(`${copy.android.pairing} failed`, pairResult)
        setLatestTask({ label: copy.android.pairing, status: "error" })
        return
      }

      appendLog(copy.android.pairing, pairResult)
      setAndroidQrStatus(copy.android.qrPaired)
      setAndroidWirelessState("paired")
      setLatestTask({ label: copy.android.resolvingEndpoint, status: "running" })

      const nextConnectEndpoint = await waitForAndroidConnectEndpoint()
      if (!nextConnectEndpoint) {
        const failure = {
          success: false,
          exitCode: 1,
          stdout: pairResult.stdout,
          stderr: copy.android.connectEndpointMissing
        }
        appendLog(`${copy.android.resolvingEndpoint} failed`, failure)
        setAndroidWirelessState("paired")
        setLatestTask({ label: copy.android.resolvingEndpoint, status: "error" })
        return
      }

      setAndroidWirelessState("endpoint-ready")
      setLatestTask({ label: copy.android.connecting, status: "running" })
      setAndroidWirelessState("connecting")
      const connectResult = await window.bridgeDesktop.connectAndroid(nextConnectEndpoint, adbPath || undefined)
      if (isFailedResult(connectResult)) {
        const failureKind = classifyAndroidConnectFailure(connectResult.stdout, connectResult.stderr)
        if (failureKind === "stale-endpoint") {
          forgetAndroidConnectEndpoint(nextConnectEndpoint)
          setAndroidWirelessState("stale-endpoint")
          setAndroidQrStatus(copy.android.connectEndpointStale)
        } else if (failureKind === "repair-required") {
          forgetAndroidConnectEndpoint(nextConnectEndpoint)
          setAndroidWirelessState("repair-required")
          setAndroidQrStatus(copy.android.connectNeedsRepair)
        } else {
          setAndroidWirelessState("error")
          setAndroidQrStatus(copy.android.qrFailed)
        }
        appendLog(`${copy.android.connecting} failed`, connectResult)
        setLatestTask({ label: copy.android.connecting, status: "error" })
        await refreshAndroidDiscoverySilently()
        return
      }

      const resolvedConnectEndpoint = parseConnectEndpointFromOutput(connectResult.stdout) ?? nextConnectEndpoint
      if (resolvedConnectEndpoint) {
        setConnectEndpoint(resolvedConnectEndpoint)
        rememberAndroidConnectEndpoint(resolvedConnectEndpoint)
      }

      const successResult = {
        ...connectResult,
        stdout: [pairResult.stdout.trim(), connectResult.stdout.trim()].filter(Boolean).join("\n")
      }
      appendLog(copy.android.connecting, successResult)
      setAndroidWirelessState("connected")
      setAndroidQrStatus(copy.android.qrConnected)
      setLatestTask({ label: copy.android.connecting, status: "success" })
    } catch (error) {
      appendLog(`${copy.android.pairing} failed`, error instanceof Error ? error.message : String(error))
      setAndroidWirelessState("error")
      setLatestTask({ label: copy.android.pairing, status: "error" })
    }
    await refreshAndroidDiscoverySilently()
  }

  async function handleAndroidConnect(): Promise<void> {
    setAndroidTargetMode("wireless")
    setAndroidWirelessState("connecting")
    setLatestTask({ label: copy.android.connecting, status: "running" })
    try {
      const result = await window.bridgeDesktop.connectAndroid(connectEndpoint, adbPath || undefined)
      if (isFailedResult(result)) {
        const failureKind = classifyAndroidConnectFailure(result.stdout, result.stderr)
        if (failureKind === "stale-endpoint") {
          forgetAndroidConnectEndpoint(connectEndpoint)
          setAndroidWirelessState("stale-endpoint")
          setAndroidQrStatus(copy.android.connectEndpointStale)
        } else if (failureKind === "repair-required") {
          forgetAndroidConnectEndpoint(connectEndpoint)
          setAndroidWirelessState("repair-required")
          setAndroidQrStatus(copy.android.connectNeedsRepair)
        } else {
          setAndroidWirelessState("error")
          setAndroidQrStatus(copy.android.qrFailed)
        }
        appendLog(`${copy.android.connecting} failed`, result)
        setLatestTask({ label: copy.android.connecting, status: "error" })
        await refreshAndroidDiscoverySilently()
        return
      }

      const resolvedConnectEndpoint = parseConnectEndpointFromOutput(result.stdout) ?? connectEndpoint.trim()
      if (resolvedConnectEndpoint) {
        setConnectEndpoint(resolvedConnectEndpoint)
        rememberAndroidConnectEndpoint(resolvedConnectEndpoint)
      }
      setAndroidQrStatus(copy.android.qrConnected)
      setAndroidWirelessState("connected")
      appendLog(copy.android.connecting, result)
      setLatestTask({ label: copy.android.connecting, status: "success" })
    } catch (error) {
      appendLog(`${copy.android.connecting} failed`, error instanceof Error ? error.message : String(error))
      setAndroidQrStatus(copy.android.qrFailed)
      setAndroidWirelessState("error")
      setLatestTask({ label: copy.android.connecting, status: "error" })
    }
    await refreshAndroidDiscoverySilently()
  }

  async function handleAndroidDisconnect(): Promise<void> {
    await runTask(copy.android.disconnecting, () => window.bridgeDesktop.disconnectAndroid(undefined, adbPath || undefined))
    setAndroidWirelessState(connectEndpoint.trim() ? "endpoint-ready" : (pairEndpoint.trim() && pairCode.trim() ? "pair-ready" : "idle"))
    await refreshAndroidDiscoverySilently()
  }

  async function handleAndroidReconnect(profile: ProfileSummary): Promise<void> {
    setPlatformSelection("android", profile.name)
    if (profile.target.includes(":")) {
      setAndroidTargetMode("wireless")
      setConnectEndpoint(profile.target)
      setAndroidProfileName(profile.name)
      setAndroidWirelessState("connecting")
      setLatestTask({ label: copy.android.connecting, status: "running" })
      try {
        const result = await window.bridgeDesktop.connectAndroid(profile.target, adbPath || undefined)
        if (isFailedResult(result)) {
          const failureKind = classifyAndroidConnectFailure(result.stdout, result.stderr)
          if (failureKind === "stale-endpoint") {
            forgetAndroidConnectEndpoint(profile.target)
            setAndroidWirelessState("stale-endpoint")
            setAndroidQrStatus(copy.android.connectEndpointStale)
          } else if (failureKind === "repair-required") {
            forgetAndroidConnectEndpoint(profile.target)
            setAndroidWirelessState("repair-required")
            setAndroidQrStatus(copy.android.connectNeedsRepair)
          } else {
            setAndroidWirelessState("error")
            setAndroidQrStatus(copy.android.qrFailed)
          }
          appendLog(`${copy.android.connecting} failed`, result)
          setLatestTask({ label: copy.android.connecting, status: "error" })
        } else {
          const resolvedConnectEndpoint = parseConnectEndpointFromOutput(result.stdout) ?? profile.target
          if (resolvedConnectEndpoint) {
            setConnectEndpoint(resolvedConnectEndpoint)
            rememberAndroidConnectEndpoint(resolvedConnectEndpoint)
          }
          setAndroidQrStatus(copy.android.qrConnected)
          setAndroidWirelessState("connected")
          appendLog(copy.android.connecting, result)
          setLatestTask({ label: copy.android.connecting, status: "success" })
        }
      } catch (error) {
        appendLog(`${copy.android.connecting} failed`, error instanceof Error ? error.message : String(error))
        setAndroidQrStatus(copy.android.qrFailed)
        setAndroidWirelessState("error")
        setLatestTask({ label: copy.android.connecting, status: "error" })
      }
      await refreshAndroidDiscoverySilently()
      return
    }

    setAndroidTargetMode("usb")
    setSelectedAndroidUsbSerial(profile.target)
    setAndroidProfileName(profile.name)
    await runTask(copy.android.reconnecting, async () => {
      const snapshot = await refreshAndroidDiscoverySilently()
      const device = snapshot.devices.find((entry) => entry.serial === profile.target)
      return device
        ? { success: true, serial: profile.target, state: device.state }
        : { success: false, serial: profile.target, message: copy.android.usbMissing }
    })
  }

  async function handleAndroidSave(): Promise<void> {
    if (!canSaveAndroid) {
      return
    }
    const targetSerial = androidSaveTarget
    const payload: AndroidProfileInput = { name: androidProfileName, serial: targetSerial, description: androidDescription }
    await runTask(copy.android.saving, () => window.bridgeDesktop.saveAndroidProfile(payload), async (profile) => {
      setPlatformSelection("android", profile.name)
      await refreshDashboard()
    })
  }

  function handleSelectAndroidUsbDevice(device: AndroidDiscoverySnapshot["devices"][number]): void {
    setSelectedAndroidUsbSerial(device.serial)
    setAndroidTargetMode("usb")
    if (!androidProfileName.trim() || androidProfileName === "pixel-air") {
      setAndroidProfileName(normalizeProfileName(device.details.model ?? device.serial))
    }
  }

  function handlePairEndpointChange(value: string): void {
    setPairEndpoint(value)
    if (androidWirelessState === "stale-endpoint" || androidWirelessState === "repair-required" || androidWirelessState === "error") {
      setAndroidWirelessState(value.trim() && pairCode.trim() ? "pair-ready" : "idle")
    }
  }

  function handlePairCodeChange(value: string): void {
    setPairCode(value)
    if (androidWirelessState === "stale-endpoint" || androidWirelessState === "repair-required" || androidWirelessState === "error") {
      setAndroidWirelessState(pairEndpoint.trim() && value.trim() ? "pair-ready" : "idle")
    }
  }

  function handleConnectEndpointChange(value: string): void {
    setConnectEndpoint(value)
    if (androidWirelessState === "stale-endpoint" || androidWirelessState === "repair-required" || androidWirelessState === "error") {
      setAndroidWirelessState(value.trim() ? "endpoint-ready" : (pairEndpoint.trim() && pairCode.trim() ? "pair-ready" : "idle"))
    }
  }

  async function handleWindowsDiscover(): Promise<void> {
    await runTask(copy.windows.discoveringHosts, () => window.bridgeDesktop.discoverWindows(windowsQuery), (result) => {
      setWindowsDiscovery(result)
    })
  }

  function applyWindowsCandidate(candidate: WindowsDiscoveryCandidate): void {
    beginWindowsConnectionDraft()
    setSelectedWindowsCandidateId(candidate.id)
    setWindowsName(normalizeProfileName(candidate.label))
    setWindowsHost(candidate.hostname)
    setWindowsPort(String(candidate.port || 22))
    setWindowsUser(candidate.username ?? "")
    if (candidate.authMethod === "password") {
      setWindowsAuthMethod("password")
    } else {
      setWindowsAuthMethod("key")
      setWindowsKeyPath(candidate.keyPath ?? defaultWindowsKeyPath)
    }
    setWindowsDescription(candidate.description ?? "")
  }

  async function handleWindowsSave(): Promise<void> {
    if (!canSaveWindows) {
      return
    }
    const payload: WindowsProfileInput = {
      name: windowsName,
      hostname: windowsHost,
      username: windowsUser,
      port: Number(windowsPort || 22),
      authMethod: windowsAuthMethod,
      keyPath: windowsKeyPath,
      password: windowsPassword,
      storePassword: windowsStorePassword,
      description: windowsDescription
    }
    await runTask(copy.windows.saving, () => window.bridgeDesktop.saveWindowsProfile(payload), async (profile) => {
      setPlatformSelection("windows", profile.name)
      await refreshDashboard()
    })
  }

  async function handleProbe(): Promise<void> {
    if (!canProbeWindows) {
      return
    }

    if (selectedProfile) {
      await runTask(copy.windows.probing, () => window.bridgeDesktop.probeProfile(selectedProfile, windowsAuthMethod === "password" ? windowsPassword : undefined))
      return
    }

    const payload: WindowsProfileInput = {
      name: windowsName || normalizeProfileName(windowsHost),
      hostname: windowsHost,
      username: windowsUser,
      port: Number(windowsPort || 22),
      authMethod: windowsAuthMethod,
      keyPath: windowsKeyPath,
      password: windowsPassword,
      storePassword: false,
      description: windowsDescription
    }

    await runTask(copy.windows.probing, () => window.bridgeDesktop.probeWindowsDraft(payload), async () => {
      setValidatedWindowsSignature(windowsDraftSignature)
    })
  }

  async function handleExecuteWindows(): Promise<void> {
    if (!selectedProfile) return
    await runTask(copy.windows.executing, () => window.bridgeDesktop.executeProfile(selectedProfile, windowsCommand, windowsAuthMethod === "password" ? windowsPassword : undefined))
  }

  async function handlePickFile(): Promise<void> {
    const result = await window.bridgeDesktop.pickFile()
    if (result) {
      beginWindowsConnectionDraft()
      setWindowsKeyPath(result)
    }
  }

  async function handleDeleteProfile(name: string): Promise<void> {
    if (!name) {
      return
    }
    const confirmed = window.confirm(`${copy.inspector.deleteConfirm} ${name}?`)
    if (!confirmed) {
      return
    }

    await runTask(copy.inspector.deleting, () => window.bridgeDesktop.deleteProfile(name), async (deleted) => {
      if (!deleted) {
        return
      }
      setProfileMenuOpen(false)
      setSelectedProfiles((current) => ({
        windows: current.windows === name ? "" : current.windows,
        android: current.android === name ? "" : current.android,
        linux: current.linux === name ? "" : current.linux
      }))
      setSelectedWindowsCandidateId("")
      setValidatedWindowsSignature("")
      await refreshDashboard()
    })
  }

  function handleSelectProfile(name: string): void {
    if (activeProfilePlatform) {
      setPlatformSelection(activeProfilePlatform, name)
    }
    if (activeProfilePlatform === "windows") {
      setValidatedWindowsSignature("")
    }
    setProfileMenuOpen(false)
  }

  return (
    <div className="app-shell">
      <header className={isTopbarSplit ? "topbar is-split" : "topbar"} style={topbarStyle}>
        <div className="topbar-brand-shell">
          <div className="topbar-brand">
            <div className={brandLogoClassName}>CB</div>
            <div className={compactStatusClassName}>
              <span className="status-badge" />
              <span className="topbar-status-text">{topbarStatusText}</span>
            </div>
          </div>
        </div>

        <div className="topbar-middle">
          <div className={topbarStatusClassName}>
            <span className="status-badge" />
            <span className="topbar-brand-title">{copy.brandTitle}</span>
            <span className="topbar-status-divider" aria-hidden="true" />
            <span className="topbar-status-meta">
              <span className="topbar-status-text">{topbarStatusText}</span>
            </span>
          </div>
          <div className="topbar-surprise" aria-hidden={!isTopbarSplit}>
            <span className={topbarSurpriseClassName}>{topbarSurprise}</span>
          </div>
        </div>

        <div className="topbar-actions">
          <button className="toolbar-icon" aria-label={copy.toolbar.languageAria} onClick={() => setLocale((current) => current === "zh" ? "en" : "zh")}>{locale === "zh" ? "中" : "EN"}</button>
          <button className="toolbar-icon" aria-label={copy.toolbar.themeAria} onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")}>{theme === "dark" ? "☾" : "☼"}</button>
          <button className="toolbar-icon" aria-label={copy.toolbar.settings} onClick={() => setSettingsOpen(true)}>⚙</button>
          <button className="toolbar-primary" onClick={() => void runTask(copy.reloadingDashboard, refreshDashboard)}>{copy.toolbar.primaryAction}</button>
        </div>
      </header>

      <div className="shell">
        <aside className="rail">
          <nav className="rail-nav">
            {copy.sections.map((section) => (
              <button key={section.id} className={section.id === activeSection ? "rail-link active" : "rail-link"} onClick={() => setActiveSection(section.id)}>
                <strong>{section.label}</strong>
              </button>
            ))}
          </nav>
        </aside>

        <main className="workspace" ref={workspaceRef}>
          <header className="workspace-header">
            <div className="header-copy">
              <h2>{copy.sections.find((section) => section.id === activeSection)?.label}</h2>
              {activeSection === "android" && androidQrStatus && <p className="section-note">{androidQrStatus}</p>}
              {activeSection === "windows" && windowsDiscovery?.scannedRange && <p className="section-note">{`${copy.windows.scannedRange}: ${windowsDiscovery.scannedRange}`}</p>}
              {activeSection === "overview" && <p className="section-note">{copy.overview.focusDescription}</p>}
            </div>
            <div className="workspace-tools">
              <div className="profile-selector" ref={profileMenuRef}>
                <div className="profile-selector-row">
                  <button className={profileMenuOpen ? "profile-trigger open" : "profile-trigger"} onClick={() => setProfileMenuOpen((current) => !current)}>
                    <div className="profile-trigger-copy">
                      <strong>{selectedProfileSummary?.name ?? copy.inspector.profilePlaceholder}</strong>
                      <span>{selectedProfileSummary?.target ?? copy.inspector.noneDescription}</span>
                    </div>
                    <small>{profileMenuOpen ? "▴" : "▾"}</small>
                  </button>
                  <button className="toolbar-icon workspace-refresh" aria-label={copy.refreshRegistry} onClick={() => void runTask(copy.reloadingDashboard, refreshDashboard)}>↻</button>
                </div>
                {profileMenuOpen && (
                  <div className="profile-menu">
                    {profileOptions.map((profile) => (
                      <div key={profile.name} className={profile.name === selectedProfile ? "profile-option active" : "profile-option"}>
                        <button className="profile-option-main" onClick={() => handleSelectProfile(profile.name)}>
                          <strong>{profile.name}</strong>
                          <span>{profile.target}</span>
                        </button>
                        <button className="profile-option-delete" onClick={() => void handleDeleteProfile(profile.name)}>{copy.inspector.deleteProfile}</button>
                      </div>
                    ))}
                    {profileOptions.length === 0 && <p className="empty-copy">{copy.inspector.noProfiles}</p>}
                  </div>
                )}
              </div>
            </div>
          </header>

          {activeSection === "overview" && (
            <section className="panel-grid">
              <div className="hero-card span-2">
                <div className="hero-copy"><h3>{copy.overview.title}</h3><p className="copy-block">{copy.overview.focusDescription}</p></div>
                <div className="hero-grid">{overviewCards.map((card) => <div key={card.label} className="metric-card"><span>{card.label}</span><strong>{card.value}</strong></div>)}</div>
              </div>
              <div className="panel-card"><h3>{copy.overview.environment}</h3><ul className="meta-list"><li><span>{copy.overview.environmentItems.electron}</span><strong>{dashboard?.environment.electron ?? "-"}</strong></li><li><span>{copy.overview.environmentItems.node}</span><strong>{dashboard?.environment.node ?? "-"}</strong></li><li><span>{copy.overview.environmentItems.platform}</span><strong>{dashboard?.environment.platform ?? "-"}</strong></li><li><span>{copy.overview.environmentItems.pythonReady}</span><strong>{dashboard?.environment.pythonAvailable ? copy.overview.environmentItems.yes : copy.overview.environmentItems.no}</strong></li></ul></div>
              <div className="panel-card"><h3>{copy.overview.focus}</h3><p className="copy-block">{copy.overview.focusDescription}</p></div>
            </section>
          )}

          {activeSection === "android" && (
            <section className="panel-grid">
              <div className="panel-card span-2">
                <div className="workflow-head">
                  <div className="header-copy"><h3>{copy.android.workflowTitle}</h3>{androidQrStatus && <p className="section-note">{androidQrStatus}</p>}</div>
                  <div className="header-actions">
                    <button className={discoverButtonClassName} disabled={!canDiscoverAndroidWireless} onClick={() => void handleAndroidDiscover()}>{copy.android.discover}</button>
                    <button
                      className={androidWirelessState === "idle" || androidWirelessState === "pair-ready" ? "toolbar-primary" : "ghost-button"}
                      disabled={!canPrepareAndroidWireless}
                      onClick={() => void handleAndroidPrepareWireless()}
                    >
                      {copy.android.showQr}
                    </button>
                  </div>
                </div>

                <div className="quick-strip">
                  <div className="quick-strip-head"><h3>{copy.android.recentTitle}</h3></div>
                  <div className="quick-list">
                    {androidProfiles.map((profile) => (
                      <button key={profile.name} className="quick-pill" onClick={() => void handleAndroidReconnect(profile)}>
                        <div className="quick-pill-copy"><strong>{profile.name}</strong><span>{profile.target}</span></div>
                        <small>{copy.android.reconnect}</small>
                      </button>
                    ))}
                    {androidProfiles.length === 0 && <p className="empty-copy">{copy.android.noRecent}</p>}
                  </div>
                </div>

                <div className="task-grid task-grid-2 android-task-grid">
                  <section className="panel-section android-wireless-section">
                    <div className="subsection-head">
                      <h4>{copy.android.wirelessTitle}</h4>
                    </div>
                    <div className="qr-shell">
                      <div className="qr-preview is-empty">
                        <p>{copy.android.qrIdle}</p>
                      </div>
                      <div className={`qr-meta wireless-state-card is-${androidWirelessStateView.tone}`}>
                        <small>{copy.android.stateTitle}</small>
                        <strong>{androidWirelessStateView.label}</strong>
                        <span>{androidWirelessStateView.description}</span>
                        <small>{connectEndpoint || pairEndpoint || copy.android.qrEmptyHint}</small>
                      </div>
                    </div>
                    <div className="field-grid field-grid-2">
                      <label><span>{copy.android.adbPath}</span><input value={adbPath} onChange={(event) => setAdbPath(event.target.value)} placeholder={copy.android.adbPathPlaceholder} /></label>
                      <label><span>{copy.android.pairEndpoint}</span><input value={pairEndpoint} onChange={(event) => handlePairEndpointChange(event.target.value)} placeholder={copy.android.pairEndpointPlaceholder} /></label>
                      <label><span>{copy.android.pairCode}</span><input value={pairCode} onChange={(event) => handlePairCodeChange(event.target.value)} placeholder={copy.android.pairCodePlaceholder} /></label>
                      <label><span>{copy.android.connectEndpoint}</span><input value={connectEndpoint} onChange={(event) => handleConnectEndpointChange(event.target.value)} placeholder={copy.android.connectEndpointPlaceholder} /></label>
                    </div>
                    <div className="button-row form-tail">
                      <button className={pairButtonClassName} disabled={!canRunAndroidPair} onClick={() => void handleAndroidPair()}>{copy.android.pair}</button>
                      <button className={connectButtonClassName} disabled={!canRunAndroidConnect} onClick={() => void handleAndroidConnect()}>{copy.android.connect}</button>
                      <button className="ghost-button subtle-button" disabled={!canRunAndroidDisconnect} onClick={() => void handleAndroidDisconnect()}>{copy.android.disconnect}</button>
                    </div>
                    <div className="stack-card">
                      <div className="stack-card-head"><h3>{copy.android.mdnsServices}</h3></div>
                      <div className="stack-list">
                        {androidServices.map((service) => (
                          <button
                            key={`${service.instanceName}-${service.address}`}
                            className="stack-item"
                            onClick={() => service.serviceType.includes("pair") ? setPairEndpoint(service.address) : setConnectEndpoint(service.address)}
                          >
                            <strong>{service.serviceType}</strong>
                            <span>{service.address || service.instanceName}</span>
                          </button>
                        ))}
                        {androidServices.length === 0 && <p className="empty-copy">{copy.android.noServices}</p>}
                      </div>
                    </div>
                  </section>

                  <section className="panel-section android-usb-section">
                    <div className="subsection-head">
                      <h4>{copy.android.usbTitle}</h4>
                    </div>
                    <div className="stack-card">
                      <div className="stack-list">
                        {androidUsbDevices.map((device) => (
                          <button
                            key={device.serial}
                            className={device.serial === selectedAndroidUsbSerial ? "stack-item active" : "stack-item"}
                            onClick={() => handleSelectAndroidUsbDevice(device)}
                          >
                            <strong>{device.serial}</strong>
                            <span>{device.details.model ?? device.details.product ?? device.state}</span>
                            <small>{device.state}</small>
                          </button>
                        ))}
                        {androidUsbDevices.length === 0 && <p className="empty-copy">{copy.android.noDevices}</p>}
                      </div>
                    </div>
                    <div className="summary-block">
                      <div className="summary-row">
                        <span>{copy.android.usbSerial}</span>
                        <strong>{selectedAndroidUsbDevice?.serial ?? copy.inspector.none}</strong>
                      </div>
                      <div className="summary-row">
                        <span>{copy.android.usbModel}</span>
                        <strong>{selectedAndroidUsbDevice?.details.model ?? selectedAndroidUsbDevice?.details.product ?? copy.inspector.none}</strong>
                      </div>
                      <div className="summary-row">
                        <span>{copy.android.usbState}</span>
                        <strong>{selectedAndroidUsbDevice?.state ?? copy.inspector.none}</strong>
                      </div>
                    </div>
                  </section>
                </div>
              </div>

              <div className="panel-card span-2">
                <div className="card-head"><h3>{copy.android.saveTitle}</h3></div>
                <div className="target-mode-row">
                  <button className={androidTargetMode === "wireless" ? "segmented-option active" : "segmented-option"} onClick={() => setAndroidTargetMode("wireless")}>{copy.android.targetWireless}</button>
                  <button className={androidTargetMode === "usb" ? "segmented-option active" : "segmented-option"} onClick={() => setAndroidTargetMode("usb")}>{copy.android.targetUsb}</button>
                </div>
                <div className="summary-block target-summary">
                  <div className="summary-row">
                    <span>{copy.android.targetValue}</span>
                    <strong>{androidSaveTarget || copy.android.noTargetSelected}</strong>
                  </div>
                </div>
                <div className="field-grid field-grid-2">
                  <label><span>{copy.android.profileName}</span><input value={androidProfileName} onChange={(event) => setAndroidProfileName(event.target.value)} /></label>
                  <label><span>{copy.android.description}</span><input value={androidDescription} onChange={(event) => setAndroidDescription(event.target.value)} placeholder={copy.android.descriptionPlaceholder} /></label>
                </div>
                <div className="button-row"><button className="primary-button" disabled={!canSaveAndroid} onClick={() => void handleAndroidSave()}>{copy.android.saveProfile}</button></div>
              </div>
            </section>
          )}

          {activeSection === "windows" && (
            <section className="workflow-stack windows-workflow">
              <div className="panel-card workflow-card">
                <div className="card-head stacked-head">
                  <div>
                    <h3>{copy.windows.workflowTitle}</h3>
                  </div>
                </div>

                <section className="card-subsection emphasis-shell">
                  <div className="subsection-head">
                    <h4>{copy.windows.discoverySection}</h4>
                  </div>
                  <div className="discover-controls section-controls">
                    <label className="stack-field compact-field"><span>{copy.windows.searchLabel}</span><input value={windowsQuery} onChange={(event) => setWindowsQuery(event.target.value)} placeholder={copy.windows.searchPlaceholder} /></label>
                    <button className="ghost-button" onClick={() => void handleWindowsDiscover()}>{copy.windows.discoverHosts}</button>
                  </div>
                </section>

                <section className="card-subsection result-shell">
                  <div className="subsection-head">
                    <h4>{copy.windows.candidateSection}</h4>
                  </div>
                  <div className="candidate-panel">
                    <div className="candidate-list">
                      {(windowsDiscovery?.candidates ?? []).map((candidate) => (
                        <button key={candidate.id} className={candidate.id === selectedWindowsCandidateId ? "candidate-item active" : "candidate-item"} onClick={() => applyWindowsCandidate(candidate)}>
                          <div className="candidate-top">
                            <strong>{candidate.label}</strong>
                            <span className="source-badge">{sourceLabel(copy, candidate.source)}</span>
                          </div>
                          <span>{candidate.hostname}:{candidate.port}</span>
                          <small>{candidate.username ?? candidate.description ?? ""}</small>
                        </button>
                      ))}
                      {(windowsDiscovery?.candidates ?? []).length === 0 && <p className="empty-copy">{copy.windows.noCandidates}</p>}
                    </div>
                  </div>
                </section>
              </div>

              <div className="panel-card workflow-card">
                <div className="card-head stacked-head"><div><h3>{copy.windows.saveTitle}</h3></div></div>

                <section className="card-subsection">
                  <div className="field-grid field-grid-3">
                    <label><span>{copy.windows.name}</span><input value={windowsName} onChange={(event) => setWindowsName(event.target.value)} /></label>
                    <label><span>{copy.windows.host}</span><input value={windowsHost} onChange={(event) => { beginWindowsConnectionDraft(); setWindowsHost(event.target.value) }} /></label>
                    <label><span>{copy.windows.port}</span><input value={windowsPort} onChange={(event) => { beginWindowsConnectionDraft(); setWindowsPort(event.target.value) }} /></label>
                    <label><span>{copy.windows.user}</span><input value={windowsUser} onChange={(event) => { beginWindowsConnectionDraft(); setWindowsUser(event.target.value) }} /></label>
                    <label><span>{copy.windows.auth}</span><select value={windowsAuthMethod} onChange={(event) => { beginWindowsConnectionDraft(); setWindowsAuthMethod(event.target.value as "key" | "password") }}><option value="key">{copy.windows.authKey}</option><option value="password">{copy.windows.authPassword}</option></select></label>
                    <label><span>{copy.windows.description}</span><input value={windowsDescription} onChange={(event) => setWindowsDescription(event.target.value)} /></label>
                  </div>
                </section>

                <section className="card-subsection">
                  {windowsAuthMethod === "key" ? <div className="field-grid field-grid-2 compact-top"><label><span>{copy.windows.keyPath}</span><input value={windowsKeyPath} onChange={(event) => { beginWindowsConnectionDraft(); setWindowsKeyPath(event.target.value) }} placeholder={defaultWindowsKeyPath || copy.windows.keyPathPlaceholder} /></label><div className="inline-actions bottom-align"><button className="ghost-button" onClick={() => void handlePickFile()}>{copy.windows.browseKey}</button></div></div> : <div className="field-grid field-grid-2 compact-top"><label><span>{copy.windows.password}</span><input type="password" value={windowsPassword} onChange={(event) => { beginWindowsConnectionDraft(); setWindowsPassword(event.target.value) }} /></label><label className="checkbox-row bottom-align checkbox-inline"><input type="checkbox" checked={windowsStorePassword} onChange={(event) => setWindowsStorePassword(event.target.checked)} /><span>{copy.windows.storePassword}</span></label></div>}
                  <div className="button-row form-tail"><button className="primary-button" disabled={!canProbeWindows} onClick={() => void handleProbe()}>{copy.windows.probeSelected}</button><button className="ghost-button" disabled={!canSaveWindows} onClick={() => void handleWindowsSave()}>{copy.windows.saveProfile}</button></div>
                </section>
              </div>

              <div className="panel-card workflow-card">
                <div className="card-head stacked-head"><div><h3>{copy.windows.commandTitle}</h3></div></div>
                <section className="card-subsection command-shell">
                  <label className="stack-field"><span>{copy.windows.command}</span><textarea value={windowsCommand} onChange={(event) => setWindowsCommand(event.target.value)} rows={4} /></label>
                  <div className="button-row"><button className="ghost-button" disabled={!selectedProfile} onClick={() => void handleExecuteWindows()}>{copy.windows.runCommand}</button></div>
                </section>
              </div>
            </section>
          )}

          {activeSection === "linux" && (
            <section className="panel-grid">
              <div className="hero-card span-2"><div className="hero-copy"><h3>{copy.linux.title}</h3><p className="copy-block">{copy.linux.rendererDescription}</p></div></div>
              <div className="panel-card"><h3>{copy.linux.main}</h3><p className="copy-block">{copy.linux.mainDescription}</p></div>
              <div className="panel-card"><h3>{copy.linux.preload}</h3><p className="copy-block">{copy.linux.preloadDescription}</p></div>
              <div className="panel-card span-2"><h3>{copy.linux.renderer}</h3><p className="copy-block">{copy.linux.rendererDescription}</p></div>
            </section>
          )}
        </main>

        <aside className="inspector">
          <section className="inspector-card">
            <div className="card-head compact"><h3>{copy.inspector.currentTarget}</h3></div>
            <div className="summary-block">
              <div className="summary-row">
                <span>{selectedProfileSummary?.name ?? copy.inspector.none}</span>
                <strong>{selectedProfileSummary?.platform ?? copy.inspector.profilePlaceholder}</strong>
              </div>
              <p className="copy-block">{currentTargetLabel}</p>
            </div>
          </section>
          <section className="inspector-card grow">
            <div className="card-head compact"><h3>{copy.inspector.activityTitle}</h3></div>
            <div className="log-list">{logLines.map((line, index) => <pre key={`${index}-${line.slice(0, 12)}`} className="log-entry">{line}</pre>)}{logLines.length === 0 && <p className="empty-copy">{copy.inspector.noLogs}</p>}</div>
          </section>
        </aside>
      </div>

      {settingsOpen && (
        <div className="overlay" onClick={() => setSettingsOpen(false)}>
          <section className="settings-panel" onClick={(event) => event.stopPropagation()}>
            <div className="card-head compact"><h3>{copy.toolbar.settingsTitle}</h3><button className="toolbar-icon" onClick={() => setSettingsOpen(false)}>{copy.toolbar.close}</button></div>
            <div className="settings-grid">
              <div className="settings-item"><span>{copy.toolbar.currentLanguage}</span><strong>{locale === "zh" ? "中文" : "English"}</strong></div>
              <div className="settings-item"><span>{copy.toolbar.currentTheme}</span><strong>{theme === "dark" ? copy.toolbar.dark : copy.toolbar.light}</strong></div>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

