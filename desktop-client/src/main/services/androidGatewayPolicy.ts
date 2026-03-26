import { posix } from "node:path"

const defaultAndroidMediaPackages = ["com.codexbridge.gateway"]
const allowedAndroidMediaPackages = new Set(
  (process.env.CODEX_BRIDGE_ANDROID_MEDIA_PACKAGES ?? defaultAndroidMediaPackages.join(","))
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
)

export const ALLOWED_ANDROID_WRITE_ROOTS = [
  "/sdcard/Download",
  "/sdcard/Documents",
  ...Array.from(allowedAndroidMediaPackages).map((pkg) => `/sdcard/Android/media/${pkg}`)
]

export const SUPPORTED_ANDROID_TEXT_ENCODINGS = new Set(["utf-8", "utf8"])
export const ANDROID_TEXT_WRITE_LIMIT_BYTES = 64 * 1024

export type AndroidTextWriteMode = "overwrite" | "append"

export type AndroidTextWriteRequest = {
  path: string
  content: string
  mode: AndroidTextWriteMode
  createIfMissing: boolean
  encoding: "utf-8"
  bytesWritten: number
}

export type AndroidMkdirRequest = {
  path: string
  recursive: boolean
}

export type AndroidPushRequest = {
  localPath: string
  remotePath: string
  overwrite: boolean
}

function normalizeAndroidPath(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    return ""
  }
  const normalized = posix.normalize(trimmed)
  if (!normalized.startsWith("/")) {
    return ""
  }
  return normalized.length > 1 && normalized.endsWith("/") ? normalized.slice(0, -1) : normalized
}

function isPathWithinRoot(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}/`)
}

export function isAllowedAndroidWritePath(path: string): boolean {
  return ALLOWED_ANDROID_WRITE_ROOTS.some((root) => isPathWithinRoot(path, root))
}

export function validateAndroidMkdirRequest(pathInput: unknown, recursiveInput?: unknown): { value: AndroidMkdirRequest } | { error: string } {
  if (typeof pathInput !== "string" || pathInput.trim().length === 0) {
    return { error: "path is required" }
  }

  const normalizedPath = normalizeAndroidPath(pathInput)
  if (!normalizedPath) {
    return { error: "path must be an absolute Android path" }
  }
  if (!isAllowedAndroidWritePath(normalizedPath)) {
    return { error: "path is outside the allowed writable roots" }
  }

  return {
    value: {
      path: normalizedPath,
      recursive: recursiveInput === undefined ? true : Boolean(recursiveInput)
    }
  }
}

export function validateAndroidTextWriteRequest(input: {
  path?: unknown
  content?: unknown
  mode?: unknown
  create_if_missing?: unknown
  createIfMissing?: unknown
  encoding?: unknown
}): { value: AndroidTextWriteRequest } | { error: string } {
  if (typeof input.path !== "string" || input.path.trim().length === 0) {
    return { error: "path is required" }
  }
  if (typeof input.content !== "string") {
    return { error: "content must be a string" }
  }

  const normalizedPath = normalizeAndroidPath(input.path)
  if (!normalizedPath) {
    return { error: "path must be an absolute Android path" }
  }
  if (!isAllowedAndroidWritePath(normalizedPath)) {
    return { error: "path is outside the allowed writable roots" }
  }
  if (ALLOWED_ANDROID_WRITE_ROOTS.includes(normalizedPath)) {
    return { error: "path must point to a file under an allowed writable root" }
  }

  const modeInput = typeof input.mode === "string" ? input.mode.trim().toLowerCase() : "overwrite"
  if (modeInput !== "overwrite" && modeInput !== "append") {
    return { error: "mode must be overwrite or append" }
  }

  const encodingInput = typeof input.encoding === "string" ? input.encoding.trim().toLowerCase() : "utf-8"
  if (!SUPPORTED_ANDROID_TEXT_ENCODINGS.has(encodingInput)) {
    return { error: "encoding must be utf-8" }
  }

  const bytesWritten = Buffer.byteLength(input.content, "utf8")
  if (bytesWritten > ANDROID_TEXT_WRITE_LIMIT_BYTES) {
    return { error: `content exceeds ${ANDROID_TEXT_WRITE_LIMIT_BYTES} bytes` }
  }

  return {
    value: {
      path: normalizedPath,
      content: input.content,
      mode: modeInput,
      createIfMissing: Boolean(input.create_if_missing ?? input.createIfMissing),
      encoding: "utf-8",
      bytesWritten
    }
  }
}

export function validateAndroidPushRequest(input: {
  localPath?: unknown
  remotePath?: unknown
  path?: unknown
  overwrite?: unknown
}): { value: AndroidPushRequest } | { error: string } {
  const remotePathInput = typeof input.remotePath === "string" ? input.remotePath : input.path
  if (typeof input.localPath !== "string" || input.localPath.trim().length === 0) {
    return { error: "localPath is required" }
  }
  if (typeof remotePathInput !== "string" || remotePathInput.trim().length === 0) {
    return { error: "remotePath is required" }
  }

  const normalizedRemotePath = normalizeAndroidPath(remotePathInput)
  if (!normalizedRemotePath) {
    return { error: "remotePath must be an absolute Android path" }
  }
  if (!isAllowedAndroidWritePath(normalizedRemotePath)) {
    return { error: "remotePath is outside the allowed writable roots" }
  }
  if (ALLOWED_ANDROID_WRITE_ROOTS.includes(normalizedRemotePath)) {
    return { error: "remotePath must point to a file under an allowed writable root" }
  }

  return {
    value: {
      localPath: input.localPath.trim(),
      remotePath: normalizedRemotePath,
      overwrite: Boolean(input.overwrite)
    }
  }
}
