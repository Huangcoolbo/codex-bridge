import { existsSync } from "node:fs"

export type GatewayIssueSource = "healthy" | "environment" | "code-regression"

export type GatewayDiagnosis = {
  issueSource: GatewayIssueSource
  code: string
  summary: string
  detail: string
  nextStep?: string
}

export type GatewaySelfCheckItem = {
  key: string
  ok: boolean
  summary: string
  detail: string
}

export type GatewaySelfCheckReport = {
  issueSource: GatewayIssueSource
  summary: string
  checks: GatewaySelfCheckItem[]
  diagnosis: GatewayDiagnosis
}

type GenericResult = {
  success?: boolean
  stdout?: string
  stderr?: string
  exit_code?: number
  exitCode?: number
}

type RuntimeCheckInput = {
  pythonPath: string
  adbCheck: () => { ok: boolean; detail: string }
}

type OperationContext = {
  target?: string
  serial?: string
  endpoint?: string
}

function environmentDiagnosis(code: string, summary: string, detail: string, nextStep?: string): GatewayDiagnosis {
  return {
    issueSource: "environment",
    code,
    summary,
    detail,
    nextStep
  }
}

function regressionDiagnosis(code: string, summary: string, detail: string, nextStep?: string): GatewayDiagnosis {
  return {
    issueSource: "code-regression",
    code,
    summary,
    detail,
    nextStep
  }
}

export function healthyDiagnosis(summary: string, detail: string): GatewayDiagnosis {
  return {
    issueSource: "healthy",
    code: "healthy",
    summary,
    detail
  }
}

function normalizeText(result: GenericResult): string {
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim()
}

function normalizeExitCode(result: GenericResult): number {
  return typeof result.exit_code === "number"
    ? result.exit_code
    : typeof result.exitCode === "number"
      ? result.exitCode
      : result.success === false
        ? 1
        : 0
}

function matchEnvironmentDiagnosis(operation: string, result: GenericResult, context: OperationContext = {}): GatewayDiagnosis | null {
  const text = normalizeText(result)
  const lower = text.toLowerCase()

  if (/adb executable was not found|install android platform-tools/i.test(text)) {
    return environmentDiagnosis(
      "adb-missing",
      "本机没有可用的 ADB 环境",
      "gateway 已经跑到了 Android provider，但本机找不到 adb.exe，因此这是环境问题，不是代码主链回归。",
      "安装 Android platform-tools，或在客户端里指定正确的 adb.exe 路径。"
    )
  }

  if (/python executable was not found|no module named|paramiko/i.test(text)) {
    return environmentDiagnosis(
      "python-runtime-missing",
      "本地 Python 运行环境不完整",
      "gateway 已经进入 Windows bridge，但本机 Python 运行环境或依赖不完整，所以更像环境问题。",
      "检查客户端 runtime 的 Python、虚拟环境和依赖安装。"
    )
  }

  if (/host key verification failed/i.test(text)) {
    return environmentDiagnosis(
      "ssh-host-key",
      "Windows SSH 主机指纹校验失败",
      "远程 Windows 主机的 SSH host key 与本机已知记录不一致，因此这是 SSH 环境问题。",
      "检查目标机 SSH 指纹变化，更新本机已知主机记录后重试。"
    )
  }

  if (/permission denied|authentication failed/i.test(text)) {
    return environmentDiagnosis(
      "ssh-auth-failed",
      "Windows SSH 认证失败",
      `远程主机 ${context.target ?? "目标主机"} 拒绝了当前认证方式，这更像账号、密码或私钥配置问题。`,
      "检查用户名、密码、私钥路径和远程 Windows 的 SSH 授权配置。"
    )
  }

  if (/actively refused|connection refused|cannot connect to/i.test(text)) {
    return environmentDiagnosis(
      operation.startsWith("android") ? "android-connect-refused" : "ssh-connect-refused",
      operation.startsWith("android") ? "Android 连接地址拒绝连接" : "Windows SSH 端口拒绝连接",
      operation.startsWith("android")
        ? `连接地址 ${context.endpoint ?? "当前 endpoint"} 已拒绝连接，通常表示端口已经变化或无线调试服务已失效。`
        : `远程主机 ${context.target ?? "目标主机"} 的 SSH 端口拒绝连接，通常表示 sshd 未启动、端口不对或被防火墙拦截。`,
      operation.startsWith("android")
        ? "重新发现或重新填写连接地址；如果仍失败，再重新配对。"
        : "检查目标 Windows 的 sshd 服务、端口、防火墙和网络可达性。"
    )
  }

  if (/timed out|timeout|operation timed out/i.test(text)) {
    return environmentDiagnosis(
      "network-timeout",
      "网络连接超时",
      "请求已经跑到 provider，但在网络连接阶段超时，这更像环境或网络问题。",
      "检查主机在线状态、局域网连通性、防火墙和代理/隔离网络。"
    )
  }

  if (/could not resolve hostname|getaddrinfo|name or service not known/i.test(text)) {
    return environmentDiagnosis(
      "dns-resolution-failed",
      "主机名解析失败",
      `gateway 已经尝试连目标 ${context.target ?? "主机"}，但本地无法解析主机名，因此更像网络或配置问题。`,
      "检查 hostname 是否正确，或直接改用 IP 地址。"
    )
  }

  if (/no route to host|network is unreachable/i.test(text)) {
    return environmentDiagnosis(
      "network-unreachable",
      "网络不可达",
      "provider 已经发起连接，但底层网络不可达，因此更像环境问题。",
      "检查本机与目标机是否在可达网络中。"
    )
  }

  if (/device unauthorized|unauthorized/i.test(text)) {
    return environmentDiagnosis(
      "android-device-unauthorized",
      "Android 设备未授权",
      `ADB 能看到设备 ${context.serial ?? "当前设备"}，但设备还没有信任这台电脑。`,
      "在手机上确认 USB / 无线调试授权后重试。"
    )
  }

  if (/device offline|offline/i.test(text)) {
    return environmentDiagnosis(
      "android-device-offline",
      "Android 设备离线",
      `设备 ${context.serial ?? "当前设备"} 已被发现，但当前 ADB 会话不可用，因此更像设备或连接环境问题。`,
      "重新插拔 USB、重新 connect，或在设备端重启调试会话。"
    )
  }

  if (/outside the allowed writable roots|command is not allowed|getprop key is not allowed/i.test(text)) {
    return environmentDiagnosis(
      "policy-blocked",
      "请求被安全策略拦截",
      "gateway 主链正常，但这次请求超出了当前 allowlist / 写入边界，所以不是代码回归。",
      "调整请求路径或动作，遵守当前受控写和安全 shell 策略。"
    )
  }

  if (/remote path not found|file not found|no such file|parent directory does not exist|is a directory, not a file/i.test(text)) {
    return environmentDiagnosis(
      operation.includes("write") || operation.includes("read") || operation.includes("files")
        ? "android-path-invalid"
        : "path-invalid",
      "目标路径无效",
      "gateway 和 provider 都已跑通，这次失败更像目标路径、目录状态或设备文件系统环境问题。",
      "检查设备上的真实路径、父目录是否存在，以及当前路径是否可读写。"
    )
  }

  if (/unknown target|no target selected|target is required/i.test(text)) {
    return environmentDiagnosis(
      "target-not-ready",
      "目标未配置或未选择",
      "gateway 主链正常，但当前没有可用 target，因此更像配置问题。",
      "先添加远程主机或设置 current target，再重试操作。"
    )
  }

  if (/unsupported shell/i.test(text)) {
    return environmentDiagnosis(
      "unsupported-shell",
      "请求指定了当前不支持的 shell",
      "这不是 gateway 主链坏了，而是请求超出了当前支持范围。",
      "改用当前支持的 shell 类型后重试。"
    )
  }

  if (/invalid json body/i.test(text)) {
    return environmentDiagnosis(
      "invalid-request-body",
      "请求体格式不正确",
      "gateway 已经收到请求，但请求 JSON 无法解析，因此更像调用侧输入问题。",
      "修正请求 JSON 结构后重试。"
    )
  }

  return null
}

export function diagnoseGatewayResult(operation: string, result: GenericResult, context: OperationContext = {}): GatewayDiagnosis {
  if (result.success) {
    return healthyDiagnosis("操作成功", "gateway、provider 和当前执行路径已完成这次请求。")
  }

  const environmentMatch = matchEnvironmentDiagnosis(operation, result, context)
  if (environmentMatch) {
    return environmentMatch
  }

  const exitCode = normalizeExitCode(result)
  const text = normalizeText(result)
  if (!text && exitCode !== 0) {
    return regressionDiagnosis(
      "silent-failure-shape",
      "返回了失败结果，但缺少可解释的错误信息",
      "这更像 gateway 或 provider 结果结构退化了，因为失败时既没有 stdout 也没有 stderr。",
      "检查最近改动是否影响了错误包装或结果归一化。"
    )
  }

  return environmentDiagnosis(
    "provider-operation-failed",
    "provider 执行失败",
    text || "请求已进入 provider，但返回了未识别的失败结果。目前更倾向于环境或目标机状态问题。",
    "先查看 stdout / stderr 原文，再结合目标机和设备状态排查。"
  )
}

export function diagnoseGatewayException(operation: string, error: unknown): GatewayDiagnosis {
  const detail = error instanceof Error ? error.message : String(error)
  return regressionDiagnosis(
    `${operation}-unexpected-exception`,
    "gateway 发生未预期异常",
    `这次失败不是 provider 的结构化失败，而是内部直接抛出了异常：${detail}`,
    "优先检查最近代码改动、导入链和错误处理逻辑。"
  )
}

export function attachGatewayDiagnosis<T extends GenericResult>(operation: string, result: T, context: OperationContext = {}): T & { diagnosis: GatewayDiagnosis } {
  return {
    ...result,
    diagnosis: diagnoseGatewayResult(operation, result, context)
  }
}

export function buildGatewaySelfCheckReport(input: RuntimeCheckInput): GatewaySelfCheckReport {
  const checks: GatewaySelfCheckItem[] = []

  const pythonAvailable = existsSync(input.pythonPath)
  checks.push({
    key: "python-runtime",
    ok: pythonAvailable,
    summary: pythonAvailable ? "Python runtime 已就绪" : "Python runtime 缺失",
    detail: pythonAvailable
      ? `已发现本地 runtime Python：${input.pythonPath}`
      : `没有找到本地 runtime Python：${input.pythonPath}`
  })

  const adb = input.adbCheck()
  checks.push({
    key: "adb-runtime",
    ok: adb.ok,
    summary: adb.ok ? "ADB 已就绪" : "ADB 不可用",
    detail: adb.detail
  })

  const failed = checks.find((item) => !item.ok)
  if (failed) {
    const diagnosis = environmentDiagnosis(
      failed.key,
      failed.summary,
      failed.detail,
      failed.key === "adb-runtime"
        ? "先修复本机 ADB 环境，再继续 Android 相关请求。"
        : "先修复本机 runtime 环境，再继续 Windows bridge 请求。"
    )
    return {
      issueSource: "environment",
      summary: failed.summary,
      checks,
      diagnosis
    }
  }

  const diagnosis = healthyDiagnosis("本地 gateway 依赖已就绪", "本地 token、Python runtime 和 ADB 主依赖目前没有明显环境异常。")
  return {
    issueSource: "healthy",
    summary: diagnosis.summary,
    checks,
    diagnosis
  }
}
