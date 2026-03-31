import { deleteProfile, loadDashboard, loadProfile, loadProfileSummary, probeProfile, saveGatewayTarget } from "./bridgeService"
import { clearCurrentTarget, getCurrentTarget, setCurrentTarget } from "./sessionService"
import { createTargetRoutes, type TargetRouteDeps } from "./agentGatewayTargetRoutesCore"

const defaultTargetRouteDeps: TargetRouteDeps = {
  loadDashboard,
  loadProfile,
  loadProfileSummary,
  probeProfile,
  saveGatewayTarget,
  deleteProfile,
  clearCurrentTarget,
  getCurrentTarget,
  setCurrentTarget
}

export { createTargetRoutes }
export type { TargetRouteDeps }

export const targetRoutes = createTargetRoutes(defaultTargetRouteDeps)
