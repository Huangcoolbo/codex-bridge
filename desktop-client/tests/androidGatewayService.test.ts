import test from "node:test"
import assert from "node:assert/strict"

import {
  ANDROID_TEXT_WRITE_LIMIT_BYTES,
  isAllowedAndroidWritePath,
  validateAndroidPushRequest,
  validateAndroidMkdirRequest,
  validateAndroidTextWriteRequest
} from "../src/main/services/androidGatewayPolicy.ts"

test("mkdir allows whitelisted shared-storage paths", () => {
  const result = validateAndroidMkdirRequest("/sdcard/Documents/codex-workspace", true)
  assert.ok("value" in result)
  if ("value" in result) {
    assert.equal(result.value.path, "/sdcard/Documents/codex-workspace")
    assert.equal(result.value.recursive, true)
  }
})

test("mkdir rejects non-whitelisted paths", () => {
  const result = validateAndroidMkdirRequest("/data/local/tmp/codex-workspace", true)
  assert.deepEqual(result, { error: "path is outside the allowed writable roots" })
})

test("write accepts overwrite mode in a whitelisted path", () => {
  const result = validateAndroidTextWriteRequest({
    path: "/sdcard/Download/test.txt",
    content: "hello from gateway",
    mode: "overwrite",
    create_if_missing: true,
    encoding: "utf-8"
  })
  assert.ok("value" in result)
  if ("value" in result) {
    assert.equal(result.value.mode, "overwrite")
    assert.equal(result.value.encoding, "utf-8")
    assert.equal(result.value.createIfMissing, true)
  }
})

test("write accepts append mode in a whitelisted path", () => {
  const result = validateAndroidTextWriteRequest({
    path: "/sdcard/Documents/test.txt",
    content: "append me",
    mode: "append"
  })
  assert.ok("value" in result)
  if ("value" in result) {
    assert.equal(result.value.mode, "append")
  }
})

test("write rejects oversized text payloads", () => {
  const result = validateAndroidTextWriteRequest({
    path: "/sdcard/Documents/big.txt",
    content: "a".repeat(ANDROID_TEXT_WRITE_LIMIT_BYTES + 1),
    mode: "overwrite"
  })
  assert.deepEqual(result, { error: `content exceeds ${ANDROID_TEXT_WRITE_LIMIT_BYTES} bytes` })
})

test("write rejects unsupported encodings", () => {
  const result = validateAndroidTextWriteRequest({
    path: "/sdcard/Documents/test.txt",
    content: "hello",
    mode: "overwrite",
    encoding: "utf-16"
  })
  assert.deepEqual(result, { error: "encoding must be utf-8" })
})

test("write rejects non-string content", () => {
  const result = validateAndroidTextWriteRequest({
    path: "/sdcard/Documents/test.txt",
    content: 42,
    mode: "overwrite"
  })
  assert.deepEqual(result, { error: "content must be a string" })
})

test("write allowlist includes configured shared-storage roots only", () => {
  assert.equal(isAllowedAndroidWritePath("/sdcard/Download/test.txt"), true)
  assert.equal(isAllowedAndroidWritePath("/sdcard/Documents/test.txt"), true)
  assert.equal(isAllowedAndroidWritePath("/sdcard/Android/media/com.codexbridge.gateway/test.txt"), true)
  assert.equal(isAllowedAndroidWritePath("/system/etc/hosts"), false)
})

test("push accepts a local file and whitelisted remote path", () => {
  const result = validateAndroidPushRequest({
    localPath: "D:\\remote-agent-bridge\\data\\staging\\hello.txt",
    remotePath: "/sdcard/Documents/hello.txt",
    overwrite: false
  })
  assert.ok("value" in result)
  if ("value" in result) {
    assert.equal(result.value.remotePath, "/sdcard/Documents/hello.txt")
    assert.equal(result.value.overwrite, false)
  }
})

test("push rejects non-whitelisted remote paths", () => {
  const result = validateAndroidPushRequest({
    localPath: "D:\\remote-agent-bridge\\data\\staging\\hello.txt",
    remotePath: "/data/local/tmp/hello.txt"
  })
  assert.deepEqual(result, { error: "remotePath is outside the allowed writable roots" })
})

test("push requires localPath and remotePath", () => {
  assert.deepEqual(validateAndroidPushRequest({ remotePath: "/sdcard/Documents/hello.txt" }), {
    error: "localPath is required"
  })
  assert.deepEqual(validateAndroidPushRequest({ localPath: "D:\\temp\\hello.txt" }), {
    error: "remotePath is required"
  })
})
