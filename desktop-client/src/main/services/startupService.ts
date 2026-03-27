import { appendFileSync, existsSync, mkdirSync } from "node:fs"
import { spawn } from "node:child_process"
import { join } from "node:path"

import { ensureRuntimeWorkspace } from "./runtimePaths"

let bootstrapStarted = false

function ensureLogDirectory(path: string): void {
  mkdirSync(path, { recursive: true })
}

function appendBootstrapLog(logPath: string, dataRoot: string, message: string): void {
  ensureLogDirectory(dataRoot)
  appendFileSync(logPath, `[${new Date().toISOString()}] ${message}\n`, "utf8")
}

function resolvePowerShell(): string {
  const pwsh = join(process.env.ProgramFiles ?? "C:\\Program Files", "PowerShell", "7", "pwsh.exe")
  if (existsSync(pwsh)) {
    return pwsh
  }
  return "powershell.exe"
}

export function runStartupBootstrap(): void {
  if (bootstrapStarted) {
    return
  }
  bootstrapStarted = true

  const paths = ensureRuntimeWorkspace()

  if (!existsSync(paths.bootstrapScriptPath)) {
    appendBootstrapLog(paths.bootstrapLogPath, paths.dataRoot, `Bootstrap skipped: script not found at ${paths.bootstrapScriptPath}`)
    return
  }

  const shell = resolvePowerShell()
  appendBootstrapLog(paths.bootstrapLogPath, paths.dataRoot, `Bootstrap starting via ${shell}`)

  const child = spawn(shell, [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    paths.bootstrapScriptPath
  ], {
    cwd: paths.runtimeRoot,
    windowsHide: true,
    env: {
      ...process.env,
      CODEX_BRIDGE_RUNTIME_ROOT: paths.runtimeRoot,
      CODEX_BRIDGE_DATA_ROOT: paths.dataRoot
    },
    stdio: ["ignore", "pipe", "pipe"]
  })

  child.stdout.on("data", (chunk) => appendBootstrapLog(paths.bootstrapLogPath, paths.dataRoot, chunk.toString().trimEnd()))
  child.stderr.on("data", (chunk) => appendBootstrapLog(paths.bootstrapLogPath, paths.dataRoot, `[stderr] ${chunk.toString().trimEnd()}`))
  child.on("error", (error) => appendBootstrapLog(paths.bootstrapLogPath, paths.dataRoot, `Bootstrap failed to start: ${error.message}`))
  child.on("close", (code) => appendBootstrapLog(paths.bootstrapLogPath, paths.dataRoot, `Bootstrap finished with code ${code ?? -1}`))
}
