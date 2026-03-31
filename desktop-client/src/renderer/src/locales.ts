export type SectionId = "overview" | "android" | "windows" | "linux"
export type Locale = "en" | "zh"
export type ThemeMode = "dark" | "light"

type SectionCopy = { id: SectionId; label: string }

type Copy = {
  brandTitle: string
  task: string
  idle: string
  loadingDashboard: string
  reloadingDashboard: string
  refreshRegistry: string
  toolbar: {
    running: string
    ready: string
    settings: string
    primaryAction: string
    languageAria: string
    themeAria: string
    settingsTitle: string
    currentLanguage: string
    currentTheme: string
    dark: string
    light: string
    close: string
  }
  sections: SectionCopy[]
  overview: {
    title: string
    cards: {
      windowsHosts: string
      androidDevices: string
      linuxPlaceholders: string
      registryFile: string
    }
    environment: string
    environmentItems: {
      electron: string
      node: string
      platform: string
      pythonReady: string
      yes: string
      no: string
    }
    focus: string
    focusDescription: string
  }
  android: {
    workflowTitle: string
    workflowHint: string
    discover: string
    showQr: string
    qrReady: string
    qrWaiting: string
    qrDetected: string
    qrFailed: string
    connectEndpointMissing: string
    qrPaired: string
    qrConnected: string
    qrIdle: string
    qrEmptyHint: string
    qrPreviewAlt: string
    adbPath: string
    adbPathPlaceholder: string
    pairService: string
    pairServicePlaceholder: string
    pairEndpoint: string
    pairEndpointPlaceholder: string
    pairCode: string
    pairCodePlaceholder: string
    connectEndpoint: string
    connectEndpointPlaceholder: string
    wirelessTitle: string
    wirelessHint: string
    usbTitle: string
    usbHint: string
    usbSerial: string
    usbModel: string
    usbState: string
    pair: string
    connect: string
    disconnect: string
    resolvingEndpoint: string
    pairHint: string
    connectHint: string
    disconnectHint: string
    sessionIdle: string
    recentTitle: string
    noRecent: string
    reconnect: string
    connectedDevices: string
    noDevices: string
    mdnsServices: string
    noServices: string
    saveTitle: string
    targetWireless: string
    targetUsb: string
    targetValue: string
    noTargetSelected: string
    profileName: string
    description: string
    descriptionPlaceholder: string
    saveProfile: string
    refreshing: string
    pairing: string
    connecting: string
    disconnecting: string
    reconnecting: string
    usbMissing: string
    saving: string
  }
  windows: {
    workflowTitle: string
    workflowHint: string
    discoverySection: string
    candidateSection: string
    basicSection: string
    authSection: string
    actionSection: string
    discoverHosts: string
    discoveringHosts: string
    searchLabel: string
    searchPlaceholder: string
    discoveredTitle: string
    discoveredHint: string
    noCandidates: string
    saveTitle: string
    name: string
    host: string
    port: string
    user: string
    auth: string
    authKey: string
    authPassword: string
    description: string
    keyPath: string
    keyPathPlaceholder: string
    browseKey: string
    password: string
    storePassword: string
    saveProfile: string
    probeSelected: string
    commandTitle: string
    command: string
    runCommand: string
    sourceRegistry: string
    sourceSsh: string
    sourceScan: string
    sourceResolved: string
    scannedRange: string
    saving: string
    probing: string
    executing: string
  }
  linux: {
    title: string
    main: string
    mainDescription: string
    preload: string
    preloadDescription: string
    renderer: string
    rendererDescription: string
  }
  inspector: {
    profilePicker: string
    profilePlaceholder: string
    currentTarget: string
    latestTask: string
    taskReady: string
    running: string
    success: string
    failed: string
    deleteProfile: string
    deleteConfirm: string
    deleting: string
    noProfiles: string
    none: string
    noneDescription: string
    activityTitle: string
    noLogs: string
  }
}

export const COPY: Record<Locale, Copy> = {
  en: {
    brandTitle: "Codex Bridge",
    task: "Status",
    idle: "Idle",
    loadingDashboard: "Loading",
    reloadingDashboard: "Refreshing",
    refreshRegistry: "Refresh",
    toolbar: {
      running: "Running",
      ready: "Ready",
      settings: "Settings",
      primaryAction: "Sync",
      languageAria: "Toggle application language",
      themeAria: "Toggle application theme",
      settingsTitle: "Settings",
      currentLanguage: "Language",
      currentTheme: "Theme",
      dark: "Dark",
      light: "Light",
      close: "Close"
    },
    sections: [
      { id: "overview", label: "Overview" },
      { id: "android", label: "Android" },
      { id: "windows", label: "Windows" },
      { id: "linux", label: "Linux" }
    ],
    overview: {
      title: "Connection Overview",
      cards: {
        windowsHosts: "Windows",
        androidDevices: "Android",
        linuxPlaceholders: "Linux",
        registryFile: "Registry"
      },
      environment: "Environment",
      environmentItems: {
        electron: "Electron",
        node: "Node",
        platform: "Platform",
        pythonReady: "Python",
        yes: "Yes",
        no: "No"
      },
      focus: "Focus",
      focusDescription: "Open a workflow to discover, fill, and reconnect faster."
    },
    android: {
      workflowTitle: "Android",
      workflowHint: "Open wireless debugging on the phone, enter the pairing endpoint and code here. The client will try to learn and remember the wireless connect endpoint after a successful connection.",
      discover: "Discover",
      showQr: "Use Phone Pairing Code",
      qrReady: "Read the pairing endpoint and code from the phone",
      qrWaiting: "Waiting for wireless service",
      qrDetected: "Wireless connect endpoint is ready",
      qrFailed: "Wireless pairing setup failed.",
      connectEndpointMissing: "Pairing succeeded, but no wireless connect endpoint was discovered yet. If you connect manually once, the client will remember that address for the same phone.",
      qrPaired: "Paired successfully. Looking for the wireless connect endpoint",
      qrConnected: "Wireless debugging is connected",
      qrIdle: "On the phone: Wireless debugging -> Pair device with pairing code. Enter the pairing endpoint and code on the right.",
      qrEmptyHint: "Waiting for manual pairing",
      qrPreviewAlt: "Android Wi-Fi pairing QR code",
      adbPath: "ADB",
      adbPathPlaceholder: "adb.exe path",
      pairService: "Pair Service",
      pairServicePlaceholder: "Generated pairing service name",
      pairEndpoint: "Pair Endpoint",
      pairEndpointPlaceholder: "192.168.x.x:pair-port",
      pairCode: "Pair Code",
      pairCodePlaceholder: "Pair secret",
      connectEndpoint: "Connect Endpoint",
      connectEndpointPlaceholder: "192.168.x.x:connect-port",
      wirelessTitle: "Wireless Pairing",
      wirelessHint: "Use the pairing endpoint and pairing code shown on the phone. After pairing or a successful manual connect, the client will try to auto-fill and remember the connect endpoint for the same phone.",
      usbTitle: "USB Devices",
      usbHint: "Use the detected USB device serial directly as the Android target.",
      usbSerial: "USB Serial",
      usbModel: "Device Model",
      usbState: "Connection State",
      pair: "Pair",
      connect: "Connect",
      disconnect: "Disconnect",
      resolvingEndpoint: "Finding connect endpoint",
      pairHint: "Use the phone pairing screen.",
      connectHint: "Connect after pairing, or reuse a remembered connect endpoint.",
      disconnectHint: "End the active session.",
      sessionIdle: "No active session",
      recentTitle: "Recent Devices",
      noRecent: "No recent devices",
      reconnect: "Reconnect",
      connectedDevices: "USB Devices",
      noDevices: "No devices",
      mdnsServices: "Wireless Services",
      noServices: "No services",
      saveTitle: "Save Device",
      targetWireless: "Wireless",
      targetUsb: "USB",
      targetValue: "Selected Target",
      noTargetSelected: "Choose a wireless or USB target",
      profileName: "Name",
      description: "Note",
      descriptionPlaceholder: "Optional",
      saveProfile: "Save",
      refreshing: "Discovering Android",
      pairing: "Pairing",
      connecting: "Connecting",
      disconnecting: "Disconnecting",
      reconnecting: "Reconnecting",
      usbMissing: "USB device is not connected",
      saving: "Saving"
    },
    windows: {
      workflowTitle: "Windows SSH",
      workflowHint: "Discover, pick, probe.",
      discoverySection: "Discovery",
      candidateSection: "Candidates",
      basicSection: "Connection",
      authSection: "Authentication",
      actionSection: "Actions",
      discoverHosts: "Discover Hosts",
      discoveringHosts: "Discovering hosts",
      searchLabel: "Host Filter",
      searchPlaceholder: "hostname, alias, or IP",
      discoveredTitle: "Candidates",
      discoveredHint: "Select a host to autofill the form.",
      noCandidates: "No hosts found",
      saveTitle: "Connection",
      name: "Name",
      host: "Host",
      port: "Port",
      user: "User",
      auth: "Auth",
      authKey: "Key",
      authPassword: "Password",
      description: "Note",
      keyPath: "Key Path",
      keyPathPlaceholder: "C:\\Users\\you\\.ssh\\id_ed25519",
      browseKey: "Browse",
      password: "Password",
      storePassword: "Store password",
      saveProfile: "Save",
      probeSelected: "Probe",
      commandTitle: "Command",
      command: "PowerShell",
      runCommand: "Run",
      sourceRegistry: "Saved",
      sourceSsh: "SSH Config",
      sourceScan: "Network",
      sourceResolved: "Resolved",
      scannedRange: "Scanned",
      saving: "Saving",
      probing: "Probing",
      executing: "Running command"
    },
    linux: {
      title: "Linux",
      main: "Main",
      mainDescription: "Reserved",
      preload: "Preload",
      preloadDescription: "Reserved",
      renderer: "Renderer",
      rendererDescription: "Reserved"
    },
    inspector: {
      profilePicker: "Profile",
      profilePlaceholder: "Manual session",
      currentTarget: "Current",
      latestTask: "Last Task",
      taskReady: "Waiting",
      running: "Running",
      success: "Success",
      failed: "Failed",
      deleteProfile: "Delete",
      deleteConfirm: "Delete profile",
      deleting: "Deleting profile",
      noProfiles: "No profiles",
      none: "None",
      noneDescription: "Select to continue",
      activityTitle: "Output",
      noLogs: "No output"
    }
  },
  zh: {
    brandTitle: "Codex Bridge",
    task: "状态",
    idle: "空闲",
    loadingDashboard: "加载中",
    reloadingDashboard: "刷新中",
    refreshRegistry: "刷新",
    toolbar: {
      running: "运行中",
      ready: "就绪",
      settings: "设置",
      primaryAction: "同步",
      languageAria: "切换应用语言",
      themeAria: "切换应用主题",
      settingsTitle: "设置",
      currentLanguage: "语言",
      currentTheme: "主题",
      dark: "深色",
      light: "浅色",
      close: "关闭"
    },
    sections: [
      { id: "overview", label: "总览" },
      { id: "android", label: "Android" },
      { id: "windows", label: "Windows" },
      { id: "linux", label: "Linux" }
    ],
    overview: {
      title: "连接概览",
      cards: {
        windowsHosts: "Windows",
        androidDevices: "Android",
        linuxPlaceholders: "Linux",
        registryFile: "注册表"
      },
      environment: "环境",
      environmentItems: {
        electron: "Electron",
        node: "Node",
        platform: "平台",
        pythonReady: "Python",
        yes: "是",
        no: "否"
      },
      focus: "当前焦点",
      focusDescription: "进入任务流后，优先发现、自动填充和快速重连。"
    },
    android: {
      workflowTitle: "Android",
      workflowHint: "在手机无线调试里查看配对地址和配对码，在这里输入并配对。连接成功一次后，客户端会尽量学会并记住这台手机的无线连接地址。",
      discover: "发现设备",
      showQr: "使用手机配对码",
      qrReady: "请在手机上查看配对地址和配对码",
      qrWaiting: "等待无线服务出现",
      qrDetected: "无线连接地址已就绪",
      qrFailed: "无线配对准备失败。",
      connectEndpointMissing: "配对成功，但暂时还没有发现无线连接地址。如果你手动连接成功一次，客户端会记住这台手机的连接地址。",
      qrPaired: "配对成功，正在查找无线连接地址",
      qrConnected: "无线调试已连接",
      qrIdle: "在手机里打开 无线调试 -> 使用配对码配对设备，把配对地址和配对码填到右侧。",
      qrEmptyHint: "等待手动配对",
      qrPreviewAlt: "Android 无线调试配对二维码",
      adbPath: "ADB",
      adbPathPlaceholder: "adb.exe 路径",
      pairService: "配对服务名",
      pairServicePlaceholder: "自动生成的配对服务名",
      pairEndpoint: "配对地址",
      pairEndpointPlaceholder: "192.168.x.x:配对端口",
      pairCode: "配对码",
      pairCodePlaceholder: "配对密钥",
      connectEndpoint: "连接地址",
      connectEndpointPlaceholder: "192.168.x.x:连接端口",
      wirelessTitle: "无线配对",
      wirelessHint: "直接使用手机显示的配对地址和配对码。配对完成后，客户端会尽量自动补全连接地址；手动连接成功一次后，也会记住同一台手机的连接地址。",
      usbTitle: "USB 设备",
      usbHint: "已接入的 USB 调试设备会直接显示在这里，可直接保存为 Android 目标。",
      usbSerial: "USB 序列号",
      usbModel: "设备型号",
      usbState: "连接状态",
      pair: "配对",
      connect: "连接",
      disconnect: "断开",
      resolvingEndpoint: "查找连接地址中",
      pairHint: "直接使用手机配对页里的信息。",
      connectHint: "配对后直接连接，或复用已经记住的连接地址。",
      disconnectHint: "结束当前会话。",
      sessionIdle: "无活动会话",
      recentTitle: "最近设备",
      noRecent: "暂无最近设备",
      reconnect: "重连",
      connectedDevices: "USB 设备",
      noDevices: "暂无设备",
      mdnsServices: "无线服务",
      noServices: "暂无服务",
      saveTitle: "保存设备",
      targetWireless: "无线目标",
      targetUsb: "USB 设备",
      targetValue: "当前目标",
      noTargetSelected: "请选择无线目标或 USB 设备",
      profileName: "名称",
      description: "备注",
      descriptionPlaceholder: "可选",
      saveProfile: "保存",
      refreshing: "发现设备中",
      pairing: "配对中",
      connecting: "连接中",
      disconnecting: "断开中",
      reconnecting: "重连中",
      usbMissing: "USB 设备未连接",
      saving: "保存中"
    },
    windows: {
      workflowTitle: "Windows SSH",
      workflowHint: "发现、选择、探测。",
      discoverySection: "发现主机",
      candidateSection: "候选主机",
      basicSection: "连接信息",
      authSection: "认证信息",
      actionSection: "操作",
      discoverHosts: "发现主机",
      discoveringHosts: "发现主机中",
      searchLabel: "筛选",
      searchPlaceholder: "主机名、别名或 IP",
      discoveredTitle: "候选主机",
      discoveredHint: "选择一项即可自动填充。",
      noCandidates: "未发现主机",
      saveTitle: "连接配置",
      name: "名称",
      host: "主机",
      port: "端口",
      user: "用户",
      auth: "认证",
      authKey: "密钥",
      authPassword: "密码",
      description: "备注",
      keyPath: "密钥路径",
      keyPathPlaceholder: "C:\\Users\\you\\.ssh\\id_ed25519",
      browseKey: "选择",
      password: "密码",
      storePassword: "保存密码",
      saveProfile: "保存",
      probeSelected: "探测",
      commandTitle: "命令",
      command: "PowerShell",
      runCommand: "执行",
      sourceRegistry: "已保存",
      sourceSsh: "SSH 配置",
      sourceScan: "局域网",
      sourceResolved: "解析",
      scannedRange: "扫描范围",
      saving: "保存中",
      probing: "探测中",
      executing: "执行中"
    },
    linux: {
      title: "Linux",
      main: "主进程",
      mainDescription: "预留",
      preload: "预加载",
      preloadDescription: "预留",
      renderer: "渲染层",
      rendererDescription: "预留"
    },
    inspector: {
      profilePicker: "配置",
      profilePlaceholder: "当前会话",
      currentTarget: "当前目标",
      latestTask: "最近任务",
      taskReady: "等待中",
      running: "进行中",
      success: "成功",
      failed: "失败",
      deleteProfile: "删除",
      deleteConfirm: "删除配置",
      deleting: "删除配置中",
      noProfiles: "暂无配置",
      none: "未选择",
      noneDescription: "选择后可操作",
      activityTitle: "输出",
      noLogs: "暂无输出"
    }
  }
}

export function detectInitialLocale(): Locale {
  const saved = window.localStorage.getItem("bridge-workbench-locale")
  if (saved === "en" || saved === "zh") {
    return saved
  }
  return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en"
}

export function detectInitialTheme(): ThemeMode {
  const saved = window.localStorage.getItem("bridge-workbench-theme")
  if (saved === "dark" || saved === "light") {
    return saved
  }
  return "light"
}
