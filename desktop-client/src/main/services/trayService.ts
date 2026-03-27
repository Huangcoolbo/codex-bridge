import { app, Menu, Tray, nativeImage, type BrowserWindow, type NativeImage } from "electron"
import { existsSync } from "node:fs"
import { join, resolve } from "node:path"

import { checkForUpdates, downloadLatestUpdate, getUpdateState, openReleasePage } from "./updateService"

let tray: Tray | null = null

function resolveTrayIcon(): NativeImage {
  const candidate = app.isPackaged
    ? join(process.resourcesPath, "assets", "icon.ico")
    : resolve(process.cwd(), "build", "icon.ico")

  if (existsSync(candidate)) {
    return nativeImage.createFromPath(candidate)
  }

  return nativeImage.createEmpty()
}

function showMainWindow(window: BrowserWindow | null): void {
  if (!window) {
    return
  }

  if (window.isMinimized()) {
    window.restore()
  }
  window.show()
  window.focus()
}

function buildContextMenu(window: BrowserWindow | null) {
  const updateState = getUpdateState()
  const versionLabel = `版本 ${app.getVersion()}`
  const updateLabel = updateState.status === "available" && updateState.latestVersion
    ? `下载 ${updateState.latestVersion}`
    : "检查更新"

  return Menu.buildFromTemplate([
    { label: "Codex.Bridge", enabled: false },
    { label: versionLabel, enabled: false },
    { type: "separator" },
    {
      label: "打开主窗口",
      click: () => showMainWindow(window)
    },
    {
      label: updateLabel,
      click: () => {
        if (updateState.status === "available") {
          void downloadLatestUpdate({ window })
          return
        }
        void checkForUpdates({ manual: true, window })
      }
    },
    {
      label: "查看发布页",
      click: () => void openReleasePage()
    },
    { type: "separator" },
    {
      label: "退出",
      click: () => app.quit()
    }
  ])
}

export function createTray(window: BrowserWindow | null): void {
  if (tray) {
    tray.setContextMenu(buildContextMenu(window))
    return
  }

  tray = new Tray(resolveTrayIcon())
  tray.setToolTip(`Codex.Bridge v${app.getVersion()}`)
  tray.setContextMenu(buildContextMenu(window))
  tray.on("double-click", () => showMainWindow(window))
  tray.on("right-click", () => {
    tray?.setContextMenu(buildContextMenu(window))
  })
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
