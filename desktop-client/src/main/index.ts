import { app, BrowserWindow } from "electron"
import { join } from "node:path"

import { registerIpcHandlers } from "./ipc"
import { startAgentGateway, stopAgentGateway } from "./services/agentGatewayService"
import { runStartupBootstrap } from "./services/startupService"
import { createTray, destroyTray } from "./services/trayService"
import { checkForUpdates, cleanupStaleUpdateInstallers } from "./services/updateService"

let mainWindow: BrowserWindow | null = null
let backgroundServicesStarted = false

function startBackgroundServices(): void {
  if (backgroundServicesStarted) {
    return
  }

  backgroundServicesStarted = true
  startAgentGateway()
  runStartupBootstrap()
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1420,
    height: 920,
    minWidth: 920,
    minHeight: 680,
    backgroundColor: "#ffffff",
    titleBarStyle: "hiddenInset",
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  registerIpcHandlers(mainWindow)
  createTray(mainWindow)

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    mainWindow.webContents.openDevTools({ mode: "detach" })
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"))
  }

  mainWindow.webContents.once("did-finish-load", () => {
    setTimeout(() => startBackgroundServices(), 0)
    setTimeout(() => {
      void checkForUpdates({ window: mainWindow })
    }, 2500)
  })
}

app.whenReady().then(() => {
  void cleanupStaleUpdateInstallers()
  createWindow()

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on("window-all-closed", () => {
  stopAgentGateway()
  destroyTray()
  if (process.platform !== "darwin") {
    app.quit()
  }
})

