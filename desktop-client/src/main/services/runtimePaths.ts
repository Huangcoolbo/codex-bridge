import { app } from "electron"
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"

type RuntimePaths = {
  bundleRoot: string
  runtimeRoot: string
  dataRoot: string
  scriptsRoot: string
  sourceRoot: string
  bootstrapScriptPath: string
  bootstrapLogPath: string
  registryPath: string
  venvPython: string
  defaultWindowsKeyPath: string
}

function getDevRepoRoot(): string {
  return resolve(process.cwd(), "..")
}

export function getRuntimePaths(): RuntimePaths {
  if (app.isPackaged) {
    const bundleRoot = join(process.resourcesPath, "runtime")
    const userDataRoot = app.getPath("userData")
    const runtimeRoot = join(userDataRoot, "runtime")
    const dataRoot = join(userDataRoot, "data")

    return {
      bundleRoot,
      runtimeRoot,
      dataRoot,
      scriptsRoot: join(runtimeRoot, "scripts"),
      sourceRoot: join(runtimeRoot, "src"),
      bootstrapScriptPath: join(runtimeRoot, "scripts", "bootstrap-client-runtime.ps1"),
      bootstrapLogPath: join(dataRoot, "client-bootstrap.log"),
      registryPath: join(dataRoot, "hosts.json"),
      venvPython: join(runtimeRoot, ".venv", "Scripts", "python.exe"),
      defaultWindowsKeyPath: join(dataRoot, "ssh", "localhost_ed25519")
    }
  }

  const repoRoot = getDevRepoRoot()
  const dataRoot = join(repoRoot, "data")

  return {
    bundleRoot: repoRoot,
    runtimeRoot: repoRoot,
    dataRoot,
    scriptsRoot: join(repoRoot, "scripts"),
    sourceRoot: join(repoRoot, "src"),
    bootstrapScriptPath: join(repoRoot, "scripts", "bootstrap-client-runtime.ps1"),
    bootstrapLogPath: join(dataRoot, "client-bootstrap.log"),
    registryPath: join(dataRoot, "hosts.json"),
    venvPython: join(repoRoot, ".venv", "Scripts", "python.exe"),
    defaultWindowsKeyPath: join(dataRoot, "ssh", "localhost_ed25519")
  }
}

export function ensureRuntimeWorkspace(): RuntimePaths {
  const paths = getRuntimePaths()
  mkdirSync(paths.dataRoot, { recursive: true })

  if (!app.isPackaged) {
    return paths
  }

  mkdirSync(paths.runtimeRoot, { recursive: true })

  const entries = ["pyproject.toml", "README.md", "src", "scripts"]
  const versionMarkerPath = join(paths.runtimeRoot, ".runtime-version")
  const installedVersion = existsSync(versionMarkerPath) ? readFileSync(versionMarkerPath, "utf8").trim() : ""
  const currentVersion = app.getVersion()
  const missingEntry = entries.some((entry) => !existsSync(join(paths.runtimeRoot, entry)))
  const needsSync = installedVersion !== currentVersion || missingEntry

  if (needsSync) {
    for (const entry of entries) {
      const from = join(paths.bundleRoot, entry)
      const to = join(paths.runtimeRoot, entry)
      if (!existsSync(from)) {
        continue
      }
      cpSync(from, to, { recursive: true, force: true })
    }

    writeFileSync(versionMarkerPath, `${currentVersion}\n`, "utf8")
  }

  return paths
}
