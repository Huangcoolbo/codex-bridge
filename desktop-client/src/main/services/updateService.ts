import { app, dialog, shell, type BrowserWindow, type MessageBoxOptions } from "electron"
import { createWriteStream } from "node:fs"
import { mkdir, readdir, rename, unlink } from "node:fs/promises"
import { get } from "node:https"
import { join } from "node:path"
import { tmpdir } from "node:os"

type UpdateAsset = {
  name: string
  url: string
}

export type UpdateState = {
  status: "idle" | "checking" | "up-to-date" | "available" | "downloading" | "downloaded" | "error"
  currentVersion: string
  latestVersion: string | null
  releaseUrl: string
  asset: UpdateAsset | null
  checkedAt: string | null
  message: string | null
}

type CheckOptions = {
  manual?: boolean
  window?: BrowserWindow | null
}

const repoOwner = "Huangcoolbo"
const repoName = "codex-bridge"
const releaseApiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/releases/latest`
const releasePageUrl = `https://github.com/${repoOwner}/${repoName}/releases/latest`

let latestState: UpdateState = {
  status: "idle",
  currentVersion: app.getVersion(),
  latestVersion: null,
  releaseUrl: releasePageUrl,
  asset: null,
  checkedAt: null,
  message: null
}

let lastPromptedVersion: string | null = null
let activeCheck: Promise<UpdateState> | null = null
const managedUpdatesDir = join(app.getPath("userData"), "updates")

function showMessage(window: BrowserWindow | null | undefined, options: MessageBoxOptions) {
  return window ? dialog.showMessageBox(window, options) : dialog.showMessageBox(options)
}

function compareVersions(left: string, right: string): number {
  const leftParts = left.replace(/^v/i, "").split(".").map((part) => Number(part) || 0)
  const rightParts = right.replace(/^v/i, "").split(".").map((part) => Number(part) || 0)
  const maxLength = Math.max(leftParts.length, rightParts.length)

  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = leftParts[index] ?? 0
    const rightValue = rightParts[index] ?? 0
    if (leftValue > rightValue) {
      return 1
    }
    if (leftValue < rightValue) {
      return -1
    }
  }

  return 0
}

function requestText(url: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const request = get(url, {
      headers: {
        "User-Agent": `${repoName}/${app.getVersion()}`,
        Accept: "application/vnd.github+json"
      }
    }, (response) => {
      const statusCode = response.statusCode ?? 0

      if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
        response.resume()
        resolvePromise(requestText(response.headers.location))
        return
      }

      if (statusCode < 200 || statusCode >= 300) {
        response.resume()
        reject(new Error(`Update request failed with status ${statusCode}.`))
        return
      }

      const chunks: Buffer[] = []
      response.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
      response.on("end", () => resolvePromise(Buffer.concat(chunks).toString("utf8")))
      response.on("error", reject)
    })

    request.on("error", reject)
  })
}

async function resolveUpdateDownloadDir(): Promise<string> {
  await mkdir(managedUpdatesDir, { recursive: true })
  return managedUpdatesDir
}

function isManagedInstallerFile(name: string): boolean {
  return /^Codex\.Bridge(?:-Setup)?-v[\d.]+\.exe(?:\.blockmap)?$/i.test(name) || /\.download$/i.test(name)
}

export async function cleanupStaleUpdateInstallers(): Promise<void> {
  const downloadDir = await resolveUpdateDownloadDir()
  const entries = await readdir(downloadDir, { withFileTypes: true }).catch(() => [])

  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && isManagedInstallerFile(entry.name))
      .map((entry) => unlink(join(downloadDir, entry.name)).catch(() => undefined))
  )
}

function selectPreferredAsset(assets: Array<{ name?: string; browser_download_url?: string }>): UpdateAsset | null {
  const normalized = assets
    .filter((asset) => asset.name && asset.browser_download_url)
    .map((asset) => ({ name: asset.name as string, url: asset.browser_download_url as string }))

  return normalized.find((asset) => /Setup-v[\d.]+\.exe$/i.test(asset.name))
    ?? normalized.find((asset) => /Codex\.Bridge-v[\d.]+\.exe$/i.test(asset.name))
    ?? normalized.find((asset) => /\.exe$/i.test(asset.name))
    ?? null
}

async function fetchLatestRelease(): Promise<UpdateState> {
  const payload = JSON.parse(await requestText(releaseApiUrl)) as {
    tag_name?: string
    html_url?: string
    assets?: Array<{ name?: string; browser_download_url?: string }>
  }

  const latestVersion = (payload.tag_name ?? "").replace(/^v/i, "").trim()
  if (!latestVersion) {
    throw new Error("Latest release does not contain a version tag.")
  }

  const asset = selectPreferredAsset(payload.assets ?? [])
  const currentVersion = app.getVersion()
  const isNewer = compareVersions(latestVersion, currentVersion) > 0

  return {
    status: isNewer ? "available" : "up-to-date",
    currentVersion,
    latestVersion,
    releaseUrl: payload.html_url ?? releasePageUrl,
    asset,
    checkedAt: new Date().toISOString(),
    message: isNewer
      ? `Found ${latestVersion}.`
      : `Already on ${currentVersion}.`
  }
}

async function downloadAsset(asset: UpdateAsset): Promise<string> {
  const downloadDir = await resolveUpdateDownloadDir()

  const targetPath = join(downloadDir, asset.name)
  const tempPath = join(tmpdir(), `${asset.name}.download`)

  return new Promise((resolvePromise, reject) => {
    const file = createWriteStream(tempPath)
    const request = get(asset.url, {
      headers: {
        "User-Agent": `${repoName}/${app.getVersion()}`,
        Accept: "application/octet-stream"
      }
    }, (response) => {
      const statusCode = response.statusCode ?? 0

      if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
        response.resume()
        file.close()
        void unlink(tempPath).catch(() => undefined)
        downloadAsset({ ...asset, url: response.headers.location }).then(resolvePromise).catch(reject)
        return
      }

      if (statusCode < 200 || statusCode >= 300) {
        response.resume()
        file.close()
        void unlink(tempPath).catch(() => undefined)
        reject(new Error(`Download failed with status ${statusCode}.`))
        return
      }

      response.pipe(file)
      file.on("finish", () => {
        file.close(async () => {
          try {
            await rename(tempPath, targetPath)
            resolvePromise(targetPath)
          } catch (error) {
            reject(error)
          }
        })
      })
    })

    request.on("error", (error) => {
      file.close()
      void unlink(tempPath).catch(() => undefined)
      reject(error)
    })
  })
}

async function promptForAvailableUpdate(window: BrowserWindow | null, state: UpdateState): Promise<void> {
  if (!state.latestVersion || !state.asset || lastPromptedVersion === state.latestVersion) {
    return
  }

  lastPromptedVersion = state.latestVersion
  const result = await showMessage(window, {
    type: "info",
    buttons: ["下载更新", "稍后", "查看发布页"],
    defaultId: 0,
    cancelId: 1,
    title: "发现新版本",
    message: `Codex.Bridge ${state.latestVersion} 已发布`,
    detail: `当前版本 ${state.currentVersion}。可直接下载并打开最新安装包。`
  })

  if (result.response === 0) {
    await downloadLatestUpdate({ window })
    return
  }

  if (result.response === 2) {
    await shell.openExternal(state.releaseUrl)
  }
}

export function getUpdateState(): UpdateState {
  return latestState
}

export async function checkForUpdates(options: CheckOptions = {}): Promise<UpdateState> {
  if (activeCheck) {
    return activeCheck
  }

  latestState = {
    ...latestState,
    status: "checking",
    currentVersion: app.getVersion(),
    message: null
  }

  activeCheck = (async () => {
    try {
      const state = await fetchLatestRelease()
      latestState = state

      if (state.status === "available") {
        await promptForAvailableUpdate(options.window ?? null, state)
      } else if (options.manual) {
        await showMessage(options.window ?? null, {
          type: "info",
          buttons: ["确定"],
          title: "检查更新",
          message: "当前已是最新版本",
          detail: `当前版本 ${state.currentVersion}`
        })
      }

      return latestState
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      latestState = {
        ...latestState,
        status: "error",
        currentVersion: app.getVersion(),
        checkedAt: new Date().toISOString(),
        message
      }

      if (options.manual) {
        await showMessage(options.window ?? null, {
          type: "error",
          buttons: ["确定"],
          title: "检查更新失败",
          message: "无法获取最新版本信息",
          detail: message
        })
      }

      return latestState
    } finally {
      activeCheck = null
    }
  })()

  return activeCheck
}

export async function downloadLatestUpdate(options: { window?: BrowserWindow | null } = {}): Promise<string | null> {
  const state = latestState.status === "available" || latestState.status === "downloaded"
    ? latestState
    : await checkForUpdates({ window: options.window ?? null })

  if (state.status !== "available" || !state.asset) {
    return null
  }

  latestState = {
    ...state,
    status: "downloading",
    message: `Downloading ${state.asset.name}...`
  }

  try {
    const filePath = await downloadAsset(state.asset)
    latestState = {
      ...state,
      status: "downloaded",
      message: filePath
    }

    const openError = await shell.openPath(filePath)
    if (openError) {
      throw new Error(openError)
    }

    await showMessage(options.window ?? null, {
      type: "info",
      buttons: ["确定"],
      title: "开始更新",
      message: "安装包已启动",
      detail: `客户端即将退出，安装完成后再次打开即可。\n${filePath}`
    })

    app.quit()

    return filePath
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    latestState = {
      ...state,
      status: "error",
      message
    }

    await showMessage(options.window ?? null, {
      type: "error",
      buttons: ["确定"],
      title: "下载更新失败",
      message: "无法下载最新安装包",
      detail: message
    })
    return null
  }
}

export async function openReleasePage(): Promise<void> {
  await shell.openExternal(latestState.releaseUrl || releasePageUrl)
}
