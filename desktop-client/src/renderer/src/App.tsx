import { useEffect, useMemo, useRef, useState, type JSX } from "react"

import type {
  AndroidDiscoverySnapshot,
  AndroidProfileInput,
  AndroidQrPayload,
  CommandDraft,
  CommandExecutionResult,
  DashboardSnapshot,
  PickedImagePayload,
  ProfileDetail,
  ProfilePlatform,
  ProfileSummary,
  WindowsDiscoveryCandidate,
  WindowsDiscoverySnapshot,
  WindowsProfileInput
} from "@shared/contracts"

import { COPY, detectInitialLocale, detectInitialTheme, type Locale, type SectionId, type ThemeMode } from "./locales"

type BarcodeDetectorResult = { rawValue?: string }
type BarcodeDetectorLike = {
  detect: (source: ImageBitmap) => Promise<BarcodeDetectorResult[]>
}
type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorLike
type LatestTaskState = {
  label: string
  status: "idle" | "running" | "success" | "error"
}
type SectionProfileState = Record<ProfilePlatform, string>
type BridgeAutomationDraftEvent = CustomEvent<CommandDraft>
type BridgeAutomationResultEvent = CustomEvent<CommandExecutionResult>

const automationDraftEvent = "bridge:automation-draft"
const automationStartEvent = "bridge:automation-command-start"
const automationFinishEvent = "bridge:automation-command-finish"

function safeStringify(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2)
}

function normalizeProfileName(value: string): string {
  const normalized = value.trim().replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")
  return normalized || "host"
}

function parseNumeric(value: string | null | undefined): number | null {
  if (!value) {
    return null
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
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

function parseAndroidQrPayload(rawText: string): AndroidQrPayload {
  const payload: AndroidQrPayload = {
    rawText,
    serviceName: null,
    password: null,
    host: null,
    pairingPort: null,
    connectPort: null,
    pairEndpoint: null,
    connectEndpoint: null
  }

  const trimmed = rawText.trim()
  const keyValues = new Map<string, string>()

  if (trimmed.startsWith("WIFI:")) {
    for (const segment of trimmed.slice(5).split(";")) {
      const divider = segment.indexOf(":")
      if (divider <= 0) {
        continue
      }
      keyValues.set(segment.slice(0, divider).toUpperCase(), segment.slice(divider + 1))
    }
  } else {
    const normalized = trimmed.replace(/[?&]/g, ";")
    for (const segment of normalized.split(";")) {
      const divider = segment.includes("=") ? segment.indexOf("=") : segment.indexOf(":")
      if (divider <= 0) {
        continue
      }
      keyValues.set(segment.slice(0, divider).trim().toUpperCase(), segment.slice(divider + 1).trim())
    }
  }

  payload.serviceName = keyValues.get("S") ?? keyValues.get("SERVICE") ?? keyValues.get("SERVICENAME") ?? null
  payload.password = keyValues.get("P") ?? keyValues.get("PASSWORD") ?? keyValues.get("CODE") ?? null
  payload.host = keyValues.get("H") ?? keyValues.get("HOST") ?? keyValues.get("IP") ?? null
  payload.pairingPort = parseNumeric(keyValues.get("PAIRPORT") ?? keyValues.get("PAIRINGPORT") ?? keyValues.get("PP"))
  payload.connectPort = parseNumeric(keyValues.get("CONNECTPORT") ?? keyValues.get("PORT") ?? keyValues.get("CP"))

  const endpointMatches = [...trimmed.matchAll(/\b((?:\d{1,3}\.){3}\d{1,3}:\d{2,5})\b/g)].map((match) => match[1])
  if (endpointMatches.length > 0) {
    payload.pairEndpoint = endpointMatches[0]
  }
  if (endpointMatches.length > 1) {
    payload.connectEndpoint = endpointMatches[1]
  }

  if (!payload.pairEndpoint && payload.host && payload.pairingPort) {
    payload.pairEndpoint = `${payload.host}:${payload.pairingPort}`
  }
  if (!payload.connectEndpoint && payload.host && payload.connectPort) {
    payload.connectEndpoint = `${payload.host}:${payload.connectPort}`
  }

  return payload
}

function resolveQrPayload(payload: AndroidQrPayload, discovery: AndroidDiscoverySnapshot | null): AndroidQrPayload {
  if (!discovery) {
    return payload
  }

  const resolved = { ...payload }

  if (!resolved.pairEndpoint && resolved.serviceName) {
    const matchingService = discovery.services.find((service) =>
      service.serviceType.includes("pair") && service.instanceName.toLowerCase().includes(resolved.serviceName!.toLowerCase())
    )
    if (matchingService) {
      resolved.pairEndpoint = matchingService.address
    }
  }

  if (!resolved.connectEndpoint && resolved.host && resolved.connectPort) {
    resolved.connectEndpoint = `${resolved.host}:${resolved.connectPort}`
  }

  return resolved
}

async function decodeQrImage(image: PickedImagePayload): Promise<string> {
  const detectorApi = (window as Window & { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector
  if (!detectorApi) {
    throw new Error("qr-unavailable")
  }

  const response = await fetch(image.dataUrl)
  const blob = await response.blob()
  const bitmap = await createImageBitmap(blob)

  try {
    const detector = new detectorApi({ formats: ["qr_code"] })
    const results = await detector.detect(bitmap)
    const value = results[0]?.rawValue?.trim()
    if (!value) {
      throw new Error("qr-empty")
    }
    return value
  } finally {
    if ("close" in bitmap) {
      bitmap.close()
    }
  }
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
  const [validatedWindowsSignature, setValidatedWindowsSignature] = useState("")
  const profileMenuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    window.localStorage.setItem("bridge-workbench-locale", locale)
    setLatestTask((current) => current.status === "idle" ? { label: copy.inspector.taskReady, status: "idle" } : current)
  }, [locale, copy.inspector.taskReady])

  useEffect(() => {
    window.localStorage.setItem("bridge-workbench-theme", theme)
    document.documentElement.dataset.theme = theme
  }, [theme])

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
  const hasActiveAndroidSession = androidDevices.some((device) => device.state === "device")
  const canPairAndroid = pairEndpoint.trim().length > 0 && pairCode.trim().length > 0
  const canConnectAndroid = connectEndpoint.trim().length > 0
  const defaultWindowsKeyPath = dashboard?.environment.defaultWindowsKeyPath ?? ""
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
  const statusLabel = latestTask.status === "running"
    ? copy.toolbar.running
    : latestTask.status === "success"
      ? copy.inspector.success
      : latestTask.status === "error"
        ? copy.inspector.failed
        : copy.toolbar.ready
  const latestTaskDisplayLabel = formatTaskLabel(latestTask.label, latestTask.status, locale)
  const statusValueLabel = latestTask.status === "idle" ? copy.idle : latestTaskDisplayLabel
  const windowsDraftTarget = windowsHost.trim()
    ? `${windowsUser.trim() ? `${windowsUser.trim()}@` : ""}${windowsHost.trim()}:${windowsPort.trim() || "22"}`
    : copy.inspector.noneDescription
  const androidDraftTarget = connectEndpoint.trim() || pairEndpoint.trim() || copy.inspector.noneDescription
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
      setConnectEndpoint(detail.hostname)
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
      if (result.devices[0]?.serial && !connectEndpoint) {
        setConnectEndpoint(result.devices[0].serial)
      }
    })
  }

  async function handleAndroidScanQr(): Promise<void> {
    const image = await window.bridgeDesktop.pickQrImage()
    if (!image) {
      return
    }

    try {
      const rawText = await decodeQrImage(image)
      let parsed = parseAndroidQrPayload(rawText)
      let latestDiscovery = androidDiscovery

      if (!latestDiscovery || (!parsed.pairEndpoint && parsed.serviceName)) {
        latestDiscovery = await window.bridgeDesktop.discoverAndroid(adbPath || undefined)
        setAndroidDiscovery(latestDiscovery)
        setAdbPath(latestDiscovery.adbPath)
      }

      parsed = resolveQrPayload(parsed, latestDiscovery)
      setAndroidQrStatus(image.name)
      setPairCode(parsed.password ?? "")
      setPairEndpoint(parsed.pairEndpoint ?? "")
      setConnectEndpoint(parsed.connectEndpoint ?? connectEndpoint)
      appendLog(copy.android.qrImported, parsed)
    } catch (error) {
      const message = error instanceof Error && error.message === "qr-unavailable"
        ? copy.android.qrUnavailable
        : copy.android.qrFailed
      setAndroidQrStatus(message)
      appendLog(copy.android.scanQr, message)
    }
  }

  async function handleAndroidPair(): Promise<void> {
    await runTask(copy.android.pairing, () => window.bridgeDesktop.pairAndroid(pairEndpoint, pairCode, adbPath || undefined))
    await handleAndroidDiscover()
  }

  async function handleAndroidConnect(): Promise<void> {
    await runTask(copy.android.connecting, () => window.bridgeDesktop.connectAndroid(connectEndpoint, adbPath || undefined))
    await handleAndroidDiscover()
  }

  async function handleAndroidDisconnect(): Promise<void> {
    await runTask(copy.android.disconnecting, () => window.bridgeDesktop.disconnectAndroid(undefined, adbPath || undefined))
    await handleAndroidDiscover()
  }

  async function handleAndroidReconnect(profile: ProfileSummary): Promise<void> {
    setPlatformSelection("android", profile.name)
    setConnectEndpoint(profile.target)
    setAndroidProfileName(profile.name)
    await runTask(copy.android.connecting, () => window.bridgeDesktop.connectAndroid(profile.target, adbPath || undefined))
    await handleAndroidDiscover()
  }

  async function handleAndroidSave(): Promise<void> {
    const targetSerial = connectEndpoint || androidDiscovery?.devices[0]?.serial || ""
    const payload: AndroidProfileInput = { name: androidProfileName, serial: targetSerial, description: androidDescription }
    await runTask(copy.android.saving, () => window.bridgeDesktop.saveAndroidProfile(payload), async (profile) => {
      setPlatformSelection("android", profile.name)
      await refreshDashboard()
    })
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
      <header className="topbar">
        <div className="topbar-brand">
          <div className="brand-logo">CB</div>
          <div className="topbar-brand-copy">
            <strong>{copy.brandTitle}</strong>
          </div>
        </div>

        <div
          className={
            latestTask.status === "error"
              ? "topbar-status is-failed"
              : latestTask.status === "success"
                ? "topbar-status is-success"
                : "topbar-status"
          }
        >
          <span className="status-badge" />
          <span>{statusLabel}</span>
          <strong>{statusValueLabel}</strong>
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

        <main className="workspace">
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
                    <button className="ghost-button" onClick={() => void handleAndroidDiscover()}>{copy.android.discover}</button>
                    <button className="toolbar-primary" onClick={() => void handleAndroidScanQr()}>{copy.android.scanQr}</button>
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

                <div className="task-grid task-grid-2">
                  <section className="panel-section">
                    <div className="field-grid field-grid-2">
                      <label><span>{copy.android.adbPath}</span><input value={adbPath} onChange={(event) => setAdbPath(event.target.value)} placeholder={copy.android.adbPathPlaceholder} /></label>
                      <label><span>{copy.android.pairEndpoint}</span><input value={pairEndpoint} onChange={(event) => setPairEndpoint(event.target.value)} placeholder={copy.android.pairEndpointPlaceholder} /></label>
                      <label><span>{copy.android.pairCode}</span><input value={pairCode} onChange={(event) => setPairCode(event.target.value)} placeholder={copy.android.pairCodePlaceholder} /></label>
                      <label><span>{copy.android.connectEndpoint}</span><input value={connectEndpoint} onChange={(event) => setConnectEndpoint(event.target.value)} placeholder={copy.android.connectEndpointPlaceholder} /></label>
                    </div>
                    <div className="action-flow">
                      <div className="action-step">
                        <div className="action-step-copy"><strong>{copy.android.pair}</strong><p>{copy.android.pairHint}</p></div>
                        <button className="ghost-button" disabled={!canPairAndroid} onClick={() => void handleAndroidPair()}>{copy.android.pair}</button>
                      </div>
                      <div className="action-step action-step-accent">
                        <div className="action-step-copy"><strong>{copy.android.connect}</strong><p>{copy.android.connectHint}</p></div>
                        <button className="primary-button" disabled={!canConnectAndroid} onClick={() => void handleAndroidConnect()}>{copy.android.connect}</button>
                      </div>
                      <div className="action-step action-step-muted">
                        <div className="action-step-copy"><strong>{copy.android.disconnect}</strong><p>{hasActiveAndroidSession ? copy.android.disconnectHint : copy.android.sessionIdle}</p></div>
                        <button className="ghost-button subtle-button" disabled={!hasActiveAndroidSession} onClick={() => void handleAndroidDisconnect()}>{copy.android.disconnect}</button>
                      </div>
                    </div>
                  </section>

                  <section className="panel-section">
                    <div className="stack-card">
                      <div className="stack-card-head"><h3>{copy.android.mdnsServices}</h3></div>
                      <div className="stack-list">
                        {androidServices.map((service) => (
                          <button key={`${service.instanceName}-${service.address}`} className="stack-item" onClick={() => service.serviceType.includes("pair") ? setPairEndpoint(service.address) : setConnectEndpoint(service.address)}>
                            <strong>{service.serviceType}</strong>
                            <span>{service.address || service.instanceName}</span>
                          </button>
                        ))}
                        {androidServices.length === 0 && <p className="empty-copy">{copy.android.noServices}</p>}
                      </div>
                    </div>
                    <div className="stack-card">
                      <div className="stack-card-head"><h3>{copy.android.connectedDevices}</h3></div>
                      <div className="stack-list">
                        {androidDevices.map((device) => (
                          <button key={device.serial} className="stack-item" onClick={() => setConnectEndpoint(device.serial)}>
                            <strong>{device.serial}</strong>
                            <span>{device.state}</span>
                          </button>
                        ))}
                        {androidDevices.length === 0 && <p className="empty-copy">{copy.android.noDevices}</p>}
                      </div>
                    </div>
                  </section>
                </div>
              </div>

              <div className="panel-card span-2">
                <div className="card-head"><h3>{copy.android.saveTitle}</h3></div>
                <div className="field-grid field-grid-2">
                  <label><span>{copy.android.profileName}</span><input value={androidProfileName} onChange={(event) => setAndroidProfileName(event.target.value)} /></label>
                  <label><span>{copy.android.description}</span><input value={androidDescription} onChange={(event) => setAndroidDescription(event.target.value)} placeholder={copy.android.descriptionPlaceholder} /></label>
                </div>
                <div className="button-row"><button className="primary-button" onClick={() => void handleAndroidSave()}>{copy.android.saveProfile}</button></div>
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

