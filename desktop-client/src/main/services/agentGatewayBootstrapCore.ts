export type GatewayTokenSource = "env" | "file"

export type GatewayAuthBootstrapInfo = {
  envVar: string
  tokenSource: GatewayTokenSource
  localFileStrategy: "app-data-directory"
  localFileLocations: string[]
  resolutionOrder: string[]
}

export function buildGatewayAuthBootstrapInfo(tokenSource: GatewayTokenSource, envVar: string): GatewayAuthBootstrapInfo {
  return {
    envVar,
    tokenSource,
    localFileStrategy: "app-data-directory",
    localFileLocations: [
      "development: <repo>/data/agent-gateway.token",
      "packaged: %APPDATA%/codex-bridge-desktop-client/data/agent-gateway.token"
    ],
    resolutionOrder: [
      `read ${envVar}`,
      "if missing, read the local gateway token file from the application data directory"
    ]
  }
}
