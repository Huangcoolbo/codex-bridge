import { app, BrowserWindow } from "electron"
import { join } from "node:path"

import { registerIpcHandlers } from "./ipc"
import { startAgentGateway, stopAgentGateway } from "./services/agentGatewayService"
import { runStartupBootstrap } from "./services/startupService"

let mainWindow: BrowserWindow | null = null

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
  startAgentGateway()
  runStartupBootstrap()

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    mainWindow.webContents.openDevTools({ mode: "detach" })
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"))
  }
}

app.whenReady().then(() => {
  createWindow()

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on("window-all-closed", () => {
  stopAgentGateway()
  if (process.platform !== "darwin") {
    app.quit()
  }
})

