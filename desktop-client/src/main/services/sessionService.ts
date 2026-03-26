type CurrentTargetSession = {
  target: string
  updatedAt: string
} | null

let currentTargetSession: CurrentTargetSession = null
let currentAndroidSession: CurrentTargetSession = null

export function getCurrentTarget(): CurrentTargetSession {
  return currentTargetSession ? { ...currentTargetSession } : null
}

export function setCurrentTarget(target: string): CurrentTargetSession {
  currentTargetSession = {
    target: target.trim(),
    updatedAt: new Date().toISOString()
  }
  return getCurrentTarget()
}

export function clearCurrentTarget(): void {
  currentTargetSession = null
}

export function getCurrentAndroidDevice(): CurrentTargetSession {
  return currentAndroidSession ? { ...currentAndroidSession } : null
}

export function setCurrentAndroidDevice(serial: string): CurrentTargetSession {
  currentAndroidSession = {
    target: serial.trim(),
    updatedAt: new Date().toISOString()
  }
  return getCurrentAndroidDevice()
}

export function clearCurrentAndroidDevice(): void {
  currentAndroidSession = null
}
