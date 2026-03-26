export const agentGatewayHost = "127.0.0.1"
export const agentGatewayPort = Number(process.env.BRIDGE_AGENT_PORT || 8765)
export const agentGatewayUrl = `http://${agentGatewayHost}:${agentGatewayPort}`
