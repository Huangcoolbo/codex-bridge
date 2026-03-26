import { appendFileSync, existsSync, mkdirSync } from "node:fs"
import { join, resolve } from "node:path"
import { spawn } from "node:child_process"

const desktopClientRoot = process.cwd()
const projectRoot = resolve(desktopClientRoot, "..")
const bootstrapScriptPath = join(projectRoot, "scripts", "bootstrap-client-runtime.ps1")
const bootstrapLogPath = join(projectRoot, "data", "client-bootstrap.log")

let bootstrapStarted = false

function ensureLogDirectory(): void {
  mkdirSync(join(projectRoot, "data"), { recursive: true })
}

function appendBootstrapLog(message: string): void {
  ensureLogDirectory()
  appendFileSync(bootstrapLogPath, `[${new Date().toISOString()}] ${message}\n`, "utf8")
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

  if (!existsSync(bootstrapScriptPath)) {
    appendBootstrapLog(`Bootstrap skipped: script not found at ${bootstrapScriptPath}`)
    return
  }

  const shell = resolvePowerShell()
  appendBootstrapLog(`Bootstrap starting via ${shell}`)

  const child = spawn(shell, [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    bootstrapScriptPath
  ], {
    cwd: projectRoot,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  })

  child.stdout.on("data", (chunk) => appendBootstrapLog(chunk.toString().trimEnd()))
  child.stderr.on("data", (chunk) => appendBootstrapLog(`[stderr] ${chunk.toString().trimEnd()}`))
  child.on("error", (error) => appendBootstrapLog(`Bootstrap failed to start: ${error.message}`))
  child.on("close", (code) => appendBootstrapLog(`Bootstrap finished with code ${code ?? -1}`))
}
