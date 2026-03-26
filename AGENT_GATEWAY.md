# AGENT_GATEWAY

`codex-bridge` 的 Electron 客户端除了提供给人类使用的 UI，还会在本机启动一个给 Codex / agent / 外部开发者调用的本地 HTTP 网关。

这份文档面向外部调用者，说明如何把它当成“远程执行网关”接入，而不是把 UI 当成唯一入口。

## 1. 网关定位

这个网关的职责不是替代桌面 UI，而是把同一套底层 bridge/service 能力正式暴露给程序调用方。

它目前支持：

- target 管理：列出、读取、新增、更新、删除
- current target / 当前会话目标：读取、设置、清空
- Android USB / ADB 设备查询：列出设备、读取设备信息、设置当前 Android 设备
- Android gateway 当前版本正式开放：安全只读 shell、目录列表、文件读取、文件拉取
- Android gateway 当前版本也已开放第一批受控写接口：`files/mkdir`、`files/write` 与 `files/push`
- 更高风险的 Android 写操作能力尚未对外暴露，但后续可按受控方式扩展
- probe：探测目标可用性
- command：设置命令草稿、执行命令、读取最近一次结果

UI 与 HTTP 网关共用同一套底层能力：

- 主进程 HTTP route：
  [agentGatewayService.ts](./desktop-client/src/main/services/agentGatewayService.ts)
- target 持久化与字段映射：
  [bridgeService.ts](./desktop-client/src/main/services/bridgeService.ts)
- 命令执行与最近结果：
  [automationService.ts](./desktop-client/src/main/services/automationService.ts)
- 当前会话目标：
  [sessionService.ts](./desktop-client/src/main/services/sessionService.ts)
- Python bridge / 远端执行：
  [service.py](./src/remote_agent_bridge/service.py)

简化调用链路：

`Agent -> Local HTTP Gateway -> Electron main -> bridgeService / automationService -> Python BridgeService -> SSH/ADB -> Remote target`

## 2. 启动与地址

默认监听地址：

```text
http://127.0.0.1:8765
```

当前只监听 `127.0.0.1`，不对局域网或公网开放。

### 启动 desktop client

在项目根目录运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\launch-bridge-client.ps1
```

或者进入 [desktop-client](./desktop-client) 运行：

```powershell
npm run dev
```

### 确认网关在线

```bash
curl http://127.0.0.1:8765/health
```

成功示例：

```json
{
  "success": true,
  "app": "Codex Bridge Workbench",
  "gateway": {
    "host": "127.0.0.1",
    "port": 8765,
    "url": "http://127.0.0.1:8765"
  }
}
```

## 3. 完整接口清单

### 健康检查

- `GET /health`

### Target 列表 / 详情

- `GET /api/targets`
- `GET /api/targets/:name`

### Current Target / Session

- `GET /api/targets/current`
- `POST /api/targets/current`
- `DELETE /api/targets/current`

### Android Devices / Session

- `GET /api/android/devices`
- `GET /api/android/devices/:serial/info`
- `GET /api/android/current`
- `POST /api/android/current`
- `DELETE /api/android/current`

### Android Safe Shell / Files

- `POST /api/android/devices/:serial/shell/execute`
- `POST /api/android/devices/:serial/files/list`
- `POST /api/android/devices/:serial/files/mkdir`
- `POST /api/android/devices/:serial/files/read`
- `POST /api/android/devices/:serial/files/write`
- `POST /api/android/devices/:serial/files/push`
- `POST /api/android/devices/:serial/files/pull`

### Target 新增 / 更新 / 删除

- `POST /api/targets`
- `PUT /api/targets/:name`
- `DELETE /api/targets/:name`

### Probe

- `POST /api/probe`

### Command

- `POST /api/command/set`
- `POST /api/command/run`
- `POST /api/command/execute`
- `GET /api/command/last`

## 4. 接口详细说明

## 4.1 健康检查

### `GET /health`

用途：确认本地网关进程是否在线。

请求体：无

示例：

```bash
curl http://127.0.0.1:8765/health
```

成功响应：

```json
{
  "success": true,
  "app": "Codex Bridge Workbench",
  "gateway": {
    "host": "127.0.0.1",
    "port": 8765,
    "url": "http://127.0.0.1:8765"
  }
}
```

字段说明：

- `success`: 固定为 `true`
- `app`: 客户端应用名
- `gateway.host`: 当前绑定地址
- `gateway.port`: 当前端口
- `gateway.url`: 当前完整地址

常见错误：

- 客户端未启动：连接被拒绝

## 4.2 Target 列表

### `GET /api/targets`

用途：列出所有已保存 target 的摘要。

请求体：无

示例：

```bash
curl http://127.0.0.1:8765/api/targets
```

成功响应：

```json
{
  "success": true,
  "profiles": [
    {
      "name": "localhost",
      "platform": "windows",
      "transport": "ssh",
      "target": "38961@127.0.0.1:22",
      "description": null
    }
  ],
  "counts": {
    "windows": 1,
    "android": 0,
    "linux": 0
  }
}
```

字段说明：

- `profiles`: 已保存 target 摘要数组
- `profiles[].name`: target 名称，后续调用时用作 `:name`
- `profiles[].platform`: `windows | android | linux`
- `profiles[].transport`: 当前实现主要是 `ssh` 或 `adb`
- `profiles[].target`: 展示型目标字符串
- `counts`: 各平台数量

常见错误：

- 一般不会返回业务错误；客户端未启动时表现为连接失败

## 4.3 Target 详情

### `GET /api/targets/:name`

用途：读取单个 target 的详细配置视图。

请求体：无

示例：

```bash
curl http://127.0.0.1:8765/api/targets/localhost
```

成功响应：

```json
{
  "success": true,
  "profile": {
    "name": "localhost",
    "platform": "windows",
    "transport": "ssh",
    "target": "38961@127.0.0.1:22",
    "description": null,
    "host": "127.0.0.1",
    "user": "38961",
    "auth_type": "key",
    "key_path": "D:\\remote-agent-bridge\\data\\ssh\\localhost_ed25519",
    "note": null
  }
}
```

字段说明：

- `profile.host`: 对应底层 `hostname`
- `profile.user`: 对应底层 `username`
- `profile.auth_type`: `key | password`
- `profile.key_path`: 持久化密钥路径
- `profile.note`: 对应底层 `description`

常见错误：

```json
{
  "success": false,
  "error": "Unknown target: missing-host"
}
```

HTTP 状态：

- `404`: target 不存在

## 4.4 Current Target / 当前会话目标

当前会话目标是主进程内存中的 session 状态，用来表达“当前上下文关注的是哪一个 target”。

它不是 `hosts.json` 的一部分。

### `GET /api/targets/current`

用途：读取当前会话目标。

示例：

```bash
curl http://127.0.0.1:8765/api/targets/current
```

成功响应：

```json
{
  "success": true,
  "current": {
    "target": "localhost",
    "updatedAt": "2026-03-26T09:27:06.832Z"
  }
}
```

若当前为空：

```json
{
  "success": true,
  "current": null
}
```

### `POST /api/targets/current`

用途：显式设置当前会话目标。

请求体示例：

```json
{
  "target": "localhost"
}
```

示例：

```bash
curl -X POST http://127.0.0.1:8765/api/targets/current \
  -H "Content-Type: application/json" \
  -d '{"target":"localhost"}'
```

成功响应：

```json
{
  "success": true,
  "current": {
    "target": "localhost",
    "updatedAt": "2026-03-26T09:27:06.832Z"
  },
  "profile": {
    "name": "localhost",
    "platform": "windows",
    "transport": "ssh",
    "target": "38961@127.0.0.1:22",
    "description": null,
    "host": "127.0.0.1",
    "user": "38961",
    "auth_type": "key",
    "key_path": "D:\\remote-agent-bridge\\data\\ssh\\localhost_ed25519",
    "note": null
  }
}
```

常见错误：

- `400`

```json
{
  "success": false,
  "error": "target is required"
}
```

- `404`

```json
{
  "success": false,
  "error": "Unknown target: missing-host"
}
```

### `DELETE /api/targets/current`

用途：清空当前会话目标。

示例：

```bash
curl -X DELETE http://127.0.0.1:8765/api/targets/current
```

成功响应：

```json
{
  "success": true
}
```

## 4.5 新增 Target

### `POST /api/targets`

用途：新增一个 target，并写回 `data/hosts.json`。

Windows target 请求体示例：

```json
{
  "name": "lab-win",
  "platform": "windows",
  "host": "192.168.1.50",
  "port": 22,
  "user": "admin",
  "auth_type": "key",
  "key_path": "D:\\remote-agent-bridge\\data\\ssh\\localhost_ed25519",
  "note": "lab machine"
}
```

Android target 请求体示例：

```json
{
  "name": "pixel-air",
  "platform": "android",
  "serial": "192.168.1.80:40217",
  "note": "wireless adb"
}
```

示例：

```bash
curl -X POST http://127.0.0.1:8765/api/targets \
  -H "Content-Type: application/json" \
  -d '{"name":"lab-win","platform":"windows","host":"192.168.1.50","port":22,"user":"admin","auth_type":"key","key_path":"D:\\remote-agent-bridge\\data\\ssh\\localhost_ed25519","note":"lab machine"}'
```

成功响应：

```json
{
  "success": true,
  "profile": {
    "name": "lab-win",
    "platform": "windows",
    "transport": "ssh",
    "target": "admin@192.168.1.50:22",
    "description": "lab machine",
    "host": "192.168.1.50",
    "user": "admin",
    "auth_type": "key",
    "key_path": "D:\\remote-agent-bridge\\data\\ssh\\localhost_ed25519",
    "note": "lab machine"
  }
}
```

常见错误：

- `400`

```json
{
  "success": false,
  "error": "platform is required"
}
```

```json
{
  "success": false,
  "error": "host is required for windows targets"
}
```

```json
{
  "success": false,
  "error": "user is required for windows targets"
}
```

```json
{
  "success": false,
  "error": "auth_type must be 'key' or 'password'"
}
```

## 4.6 更新 Target

### `PUT /api/targets/:name`

用途：更新一个已有 target，并写回 `data/hosts.json`。

请求体示例：

```json
{
  "name": "lab-win",
  "platform": "windows",
  "host": "192.168.1.50",
  "port": 22,
  "user": "admin",
  "auth_type": "key",
  "key_path": "D:\\remote-agent-bridge\\data\\ssh\\localhost_ed25519",
  "note": "updated note"
}
```

示例：

```bash
curl -X PUT http://127.0.0.1:8765/api/targets/lab-win \
  -H "Content-Type: application/json" \
  -d '{"name":"lab-win","platform":"windows","host":"192.168.1.50","port":22,"user":"admin","auth_type":"key","key_path":"D:\\remote-agent-bridge\\data\\ssh\\localhost_ed25519","note":"updated note"}'
```

成功响应结构与 `POST /api/targets` 相同。

常见错误：

- `404`

```json
{
  "success": false,
  "error": "Unknown target: lab-win"
}
```

- `400`

字段校验错误与新增 target 相同。

## 4.7 删除 Target

### `DELETE /api/targets/:name`

用途：删除 target，并从 `data/hosts.json` 移除。

示例：

```bash
curl -X DELETE http://127.0.0.1:8765/api/targets/lab-win
```

成功响应：

```json
{
  "success": true
}
```

常见错误：

- `404`

```json
{
  "success": false,
  "error": "Unknown target: lab-win"
}
```

## 4.8 Probe

### `POST /api/probe`

用途：探测 target 是否可连接，并返回底层 bridge 的结构化结果。

请求体示例：

```json
{
  "target": "localhost"
}
```

带一次性密码覆盖的示例：

```json
{
  "target": "lab-win",
  "passwordOverride": "temporary-password"
}
```

示例：

```bash
curl -X POST http://127.0.0.1:8765/api/probe \
  -H "Content-Type: application/json" \
  -d '{"target":"localhost"}'
```

成功响应示例：

```json
{
  "host": "localhost",
  "operation": "probe",
  "success": true,
  "exit_code": 0,
  "stdout": "{...}",
  "stderr": "",
  "data": {
    "computer_name": "DESKTOP-123",
    "current_user": "DESKTOP-123\\38961",
    "os_caption": "Microsoft Windows 11",
    "powershell_version": "5.1.22621.2506"
  }
}
```

常见错误：

- `400`

```json
{
  "success": false,
  "error": "target is required"
}
```

- 业务失败时通常仍返回 bridge 原始结构，`success` 为 `false`，`stderr` 内含认证失败、连接失败或远端异常信息。

## 4.8A Android 设备列表

### `GET /api/android/devices`

用途：列出当前通过 `adb` 可见的 Android 设备。

示例：

```bash
curl http://127.0.0.1:8765/api/android/devices
```

成功响应：

```json
{
  "success": true,
  "stdout": "",
  "stderr": "",
  "exit_code": 0,
  "data": {
    "adbPath": "C:\\Users\\38961\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Google.PlatformTools_Microsoft.Winget.Source_8wekyb3d8bbwe\\platform-tools\\adb.exe",
    "devices": [
      {
        "serial": "608e7d4d",
        "state": "device",
        "details": {
          "product": "munch",
          "model": "22021211RC",
          "device": "munch",
          "transport_id": "2"
        }
      }
    ]
  }
}
```

字段说明：

- `data.adbPath`: 当前使用的 `adb.exe`
- `data.devices[].serial`: 设备序列号
- `data.devices[].state`: `device | unauthorized | offline | unknown`
- `data.devices[].details`: `adb devices -l` 的附加字段

## 4.8B Android 当前设备

### `GET /api/android/current`

用途：读取当前 Android session 中选中的设备 serial。

示例：

```bash
curl http://127.0.0.1:8765/api/android/current
```

成功响应：

```json
{
  "success": true,
  "stdout": "",
  "stderr": "",
  "exit_code": 0,
  "data": {
    "current": {
      "target": "608e7d4d",
      "updatedAt": "2026-03-26T13:12:40.398Z"
    }
  }
}
```

### `POST /api/android/current`

用途：设置当前 Android session 设备。

请求体示例：

```json
{
  "serial": "608e7d4d"
}
```

示例：

```bash
curl -X POST http://127.0.0.1:8765/api/android/current \
  -H "Content-Type: application/json" \
  -d '{"serial":"608e7d4d"}'
```

### `DELETE /api/android/current`

用途：清空当前 Android session。

示例：

```bash
curl -X DELETE http://127.0.0.1:8765/api/android/current
```

常见错误：

- `400`

```json
{
  "success": false,
  "stdout": "",
  "stderr": "serial is required",
  "exit_code": 1,
  "data": null
}
```

## 4.8C Android 设备信息

### `GET /api/android/devices/:serial/info`

用途：读取指定 Android 设备的基础只读信息。

示例：

```bash
curl http://127.0.0.1:8765/api/android/devices/608e7d4d/info
```

成功响应：

```json
{
  "success": true,
  "stdout": "model=22021211RC\ndevice=munch\nmanufacturer=Xiaomi\nbrand=Redmi\nos_version=14\nsdk=34\nfingerprint=...\nserial_number=608e7d4d\ncpu_abi=arm64-v8a\ncurrent_user=shell",
  "stderr": "",
  "exit_code": 0,
  "data": {
    "serial": "608e7d4d",
    "operation": "info",
    "payload": {
      "model": "22021211RC",
      "device": "munch",
      "manufacturer": "Xiaomi",
      "brand": "Redmi",
      "os_caption": "Android",
      "os_version": "14",
      "sdk": "34",
      "fingerprint": "...",
      "serial_number": "608e7d4d",
      "cpu_abi": "arm64-v8a",
      "current_user": "shell",
      "drives": [
        {
          "name": "/sdcard",
          "file_system": "android"
        }
      ],
      "ipv4_addresses": []
    }
  }
}
```

## 4.8D Android 安全 Shell

### `POST /api/android/devices/:serial/shell/execute`

用途：执行 Android 安全只读命令。当前 Android gateway 只对外开放只读命令，不开放任意原始 shell；后续如需扩展写能力，应通过独立写接口分层开放，而不是混入 safe shell。

请求体示例：

```json
{
  "command": "getprop ro.product.model"
}
```

示例：

```bash
curl -X POST http://127.0.0.1:8765/api/android/devices/608e7d4d/shell/execute \
  -H "Content-Type: application/json" \
  -d '{"command":"getprop ro.product.model"}'
```

当前 allowlist：

- `id`
- `id -u`
- `id -un`
- `pwd`
- `getprop ro.product.model`
- `getprop ro.product.device`
- `getprop ro.product.manufacturer`
- `getprop ro.product.brand`
- `getprop ro.build.version.release`
- `getprop ro.build.version.sdk`
- `getprop ro.build.fingerprint`
- `getprop ro.serialno`
- `getprop ro.product.cpu.abi`

拒绝示例：

```json
{
  "success": false,
  "stdout": "",
  "stderr": "command is not allowed in safe mode",
  "exit_code": 1,
  "data": null
}
```

## 4.8E Android 文件接口

### `POST /api/android/devices/:serial/files/list`

用途：列出指定目录下的文件和目录。

请求体示例：

```json
{
  "path": "/sdcard/Download"
}
```

示例：

```bash
curl -X POST http://127.0.0.1:8765/api/android/devices/608e7d4d/files/list \
  -H "Content-Type: application/json" \
  -d '{"path":"/sdcard/Download"}'
```

成功响应摘要：

```json
{
  "success": true,
  "stdout": "foo.txt\tfile\t12\nbar\tdirectory\t\n",
  "stderr": "",
  "exit_code": 0,
  "data": {
    "serial": "608e7d4d",
    "operation": "list-files",
    "path": "/sdcard/Download",
    "entries": [
      {
        "name": "foo.txt",
        "type": "file",
        "size": 12
      },
      {
        "name": "bar",
        "type": "directory",
        "size": null
      }
    ]
  }
}
```

### `POST /api/android/devices/:serial/files/mkdir`

用途：在白名单共享存储目录下创建目录。

当前允许的可写根：

- `/sdcard/Download`
- `/sdcard/Documents`
- `/sdcard/Android/media/com.codexbridge.gateway`

请求体示例：

```json
{
  "path": "/sdcard/Documents/codex-workspace",
  "recursive": true
}
```

示例：

```bash
curl -X POST http://127.0.0.1:8765/api/android/devices/608e7d4d/files/mkdir \
  -H "Content-Type: application/json" \
  -d '{"path":"/sdcard/Documents/codex-workspace","recursive":true}'
```

成功响应摘要：

```json
{
  "success": true,
  "stdout": "created=1\n",
  "stderr": "",
  "exit_code": 0,
  "data": {
    "serial": "608e7d4d",
    "operation": "mkdir",
    "payload": {
      "path": "/sdcard/Documents/codex-workspace",
      "recursive": true,
      "created": true
    }
  }
}
```

常见错误：

```json
{
  "success": false,
  "stdout": "",
  "stderr": "path is outside the allowed writable roots",
  "exit_code": 1,
  "data": null
}
```

### `POST /api/android/devices/:serial/files/read`

用途：读取指定文本文件内容。

请求体示例：

```json
{
  "path": "/sdcard/Download/readme.txt",
  "encoding": "utf-8"
}
```

示例：

```bash
curl -X POST http://127.0.0.1:8765/api/android/devices/608e7d4d/files/read \
  -H "Content-Type: application/json" \
  -d '{"path":"/sdcard/Download/readme.txt","encoding":"utf-8"}'
```

成功响应摘要：

```json
{
  "success": true,
  "stdout": "hello android\n",
  "stderr": "",
  "exit_code": 0,
  "data": {
    "serial": "608e7d4d",
    "operation": "read-file",
    "path": "/sdcard/Download/readme.txt",
    "encoding": "utf-8",
    "payload": {
      "path": "/sdcard/Download/readme.txt",
      "encoding": "utf-8",
      "size": 14,
      "content": "hello android\n"
    }
  }
}
```

### `POST /api/android/devices/:serial/files/write`

用途：对白名单目录内的文本文件进行受控写入。它不是通用文件系统写入口，也不属于 `safe shell`。

当前限制：

- 仅允许白名单目录：
  - `/sdcard/Download`
  - `/sdcard/Documents`
  - `/sdcard/Android/media/com.codexbridge.gateway`
- 仅允许文本写入
- 仅支持 `utf-8`
- 仅支持 `overwrite` / `append`
- 单次写入上限：`65536` bytes
- `create_if_missing=true` 时仅允许创建文件，不会自动无限级创建父目录

请求体示例：

```json
{
  "path": "/sdcard/Documents/codex-workspace/test.txt",
  "content": "hello from gateway",
  "mode": "overwrite",
  "create_if_missing": true,
  "encoding": "utf-8"
}
```

示例：

```bash
curl -X POST http://127.0.0.1:8765/api/android/devices/608e7d4d/files/write \
  -H "Content-Type: application/json" \
  -d '{"path":"/sdcard/Documents/codex-workspace/test.txt","content":"hello from gateway","mode":"overwrite","create_if_missing":true,"encoding":"utf-8"}'
```

成功响应摘要：

```json
{
  "success": true,
  "stdout": "",
  "stderr": "C:\\Users\\38961\\AppData\\Local\\Temp\\codex-bridge-android-write-xxxxxx\\test.txt: 1 file pushed, 0 skipped. 0.0 MB/s (18 bytes in 0.006s)\r\n",
  "exit_code": 0,
  "data": {
    "serial": "608e7d4d",
    "operation": "files-write",
    "payload": {
      "path": "/sdcard/Documents/codex-workspace/test.txt",
      "bytes_written": 18,
      "created": true,
      "mode": "overwrite",
      "encoding": "utf-8"
    }
  }
}
```

常见错误：

```json
{
  "success": false,
  "stdout": "",
  "stderr": "encoding must be utf-8",
  "exit_code": 1,
  "data": null
}
```

```json
{
  "success": false,
  "stdout": "",
  "stderr": "Parent directory does not exist: /sdcard/Documents/missing-parent",
  "exit_code": 1,
  "data": null
}
```

### `POST /api/android/devices/:serial/files/pull`

用途：把手机文件拉到本地。

请求体示例：

```json
{
  "path": "/sdcard/Download/readme.txt"
}
```

或指定目标本地路径：

```json
{
  "path": "/sdcard/Download/readme.txt",
  "localPath": "D:\\remote-agent-bridge\\data\\android-pulls\\608e7d4d\\readme.txt"
}
```

示例：

```bash
curl -X POST http://127.0.0.1:8765/api/android/devices/608e7d4d/files/pull \
  -H "Content-Type: application/json" \
  -d '{"path":"/sdcard/Download/readme.txt"}'
```

说明：

- 未指定 `localPath` 时，默认保存到：
  `D:\\remote-agent-bridge\\data\\android-pulls\\<serial>\\<filename>`
- 当前 Android gateway 已正式开放：
  - 只读：`files/list` / `files/read` / `files/pull`
  - 受控写：`files/mkdir` / `files/write` / `files/push`
- 这不代表 Android/ADB 或项目底层只支持这些；更准确地说，当前版本只把上述能力产品化暴露为正式 HTTP API

### `POST /api/android/devices/:serial/files/push`

用途：把本地文件推送到白名单目录下的远端文件路径。

当前限制：

- `remotePath` 必须位于白名单目录内
- 必须显式提供 `localPath`
- 默认 `overwrite=false`
- 父目录必须已存在；目录准备仍然走 `files/mkdir`
- 不允许把白名单根目录本身当作目标文件

请求体示例：

```json
{
  "localPath": "D:\\remote-agent-bridge\\data\\staging\\hello.txt",
  "remotePath": "/sdcard/Documents/codex-gateway-workspace/hello.txt",
  "overwrite": false
}
```

示例：

```bash
curl -X POST http://127.0.0.1:8765/api/android/devices/608e7d4d/files/push \
  -H "Content-Type: application/json" \
  -d '{"localPath":"D:\\remote-agent-bridge\\data\\staging\\hello.txt","remotePath":"/sdcard/Documents/codex-gateway-workspace/hello.txt","overwrite":false}'
```

成功响应摘要：

```json
{
  "success": true,
  "stdout": "",
  "stderr": "D:\\remote-agent-bridge\\data\\staging\\hello.txt: 1 file pushed, 0 skipped. 0.0 MB/s (18 bytes in 0.006s)\r\n",
  "exit_code": 0,
  "data": {
    "serial": "608e7d4d",
    "operation": "files-push",
    "payload": {
      "localPath": "D:\\remote-agent-bridge\\data\\staging\\hello.txt",
      "remotePath": "/sdcard/Documents/codex-gateway-workspace/hello.txt",
      "bytes_written": 18,
      "overwritten": false
    }
  }
}
```

常见错误：

```json
{
  "success": false,
  "stdout": "",
  "stderr": "Remote file already exists: /sdcard/Documents/codex-gateway-workspace/hello.txt",
  "exit_code": 1,
  "data": null
}
```

## 10A. Android 写操作分层设计

下面这一节描述的是后续仍处于设计中的 Android 写接口，不包括已经实现的 `files/mkdir` 与 `files/write`。

设计原则：

- 所有接口都必须显式带 `serial`
- 返回统一结构：`success / stdout / stderr / exit_code / data`
- 写能力单独分层，不混入当前 `safe shell`
- 低风险能力优先，高风险能力单独受限
- 不开放任意 `raw adb shell`

### L1 低风险：后续低风险写能力

#### `POST /api/android/devices/:serial/files/push`

`files/push` 已在当前版本实现。这里保留它的设计原则，作为后续同类写能力的参考基线。

用途：把本地文件推送到设备指定路径。

请求体建议：

```json
{
  "localPath": "D:\\remote-agent-bridge\\data\\staging\\readme.txt",
  "remotePath": "/sdcard/Download/readme.txt",
  "overwrite": false
}
```

建议边界：

- 仅允许写入用户可见共享存储目录：
  - `/sdcard/Download`
  - `/sdcard/Documents`
  - `/sdcard/Pictures`
  - `/sdcard/Movies`
- 默认 `overwrite=false`
- 若目标已存在且未显式允许覆盖，应返回失败
- 不允许写入 `/data`, `/system`, `/vendor` 等高风险路径

### L2 中风险：文件删除

#### `POST /api/android/devices/:serial/files/delete`

用途：删除文件或目录。

请求体建议：

```json
{
  "path": "/sdcard/Documents/codex-output/readme.txt",
  "recursive": false
}
```

建议边界：

- 默认只允许删除文件
- 目录删除必须显式 `recursive=true`
- 仅允许删除白名单工作区内的内容
- 建议额外引入工作区根，例如：
  `/sdcard/Documents/codex-workspace`
- 不允许删除共享存储根目录、系统目录或隐藏敏感路径

### L3 中风险：输入注入

#### `POST /api/android/devices/:serial/input/tap`

用途：执行单次点击。

请求体建议：

```json
{
  "x": 540,
  "y": 1620
}
```

建议边界：

- 坐标必须为整数
- 应先校验设备分辨率范围
- 单次请求只允许一个 tap，不支持脚本化手势序列

#### `POST /api/android/devices/:serial/input/text`

用途：输入文本。

请求体建议：

```json
{
  "text": "hello from codex"
}
```

建议边界：

- 限制最大长度，例如 `<= 200`
- 默认只允许可打印文本
- 需要转义空格和特殊字符
- 不支持组合按键、剪贴板注入、IME 切换

### L4 较高风险：安装 APK

#### `POST /api/android/devices/:serial/packages/install`

用途：安装本地 APK。

请求体建议：

```json
{
  "localPath": "D:\\remote-agent-bridge\\data\\packages\\demo.apk",
  "replace": false,
  "grantRuntimePermissions": false
}
```

建议边界：

- 只允许安装本地现成 APK
- 默认 `replace=false`
- 默认 `grantRuntimePermissions=false`
- 不支持静默卸载
- 不支持任意 `pm` 命令透传
- 应返回包名、安装结果、是否替换安装

## 10B. Android 写接口的风险分层建议

建议按下面顺序逐步开放，而不是一次性全部开放：

1. `files/delete`
2. `input/tap`
3. `input/text`
4. `packages/install`

理由：

- `mkdir / write / push` 已经落地，后续剩下的能力风险会更高
- `delete` 开始具备破坏性，需要更严格边界
- `input` 会直接影响前台应用和设备状态
- `install apk` 影响系统应用状态，风险最高

## 10C. Android 写接口的统一响应约定

建议所有写接口都返回统一结构：

```json
{
  "success": true,
  "stdout": "",
  "stderr": "",
  "exit_code": 0,
  "data": {
    "serial": "608e7d4d",
    "operation": "files-push",
    "payload": {
      "remotePath": "/sdcard/Download/readme.txt"
    }
  }
}
```

失败时同样保持统一结构：

```json
{
  "success": false,
  "stdout": "",
  "stderr": "remotePath is outside the allowed writable roots",
  "exit_code": 1,
  "data": null
}
```

对于 `files/write`，当前实现已经在 `data.payload` 返回：

- `path`
- `bytes_written`
- `created`
- `mode`
- `encoding`

## 10D. Android 写能力的正确表述

对外表述统一使用下面这个口径：

> 当前 Android gateway 只开放了只读接口；写操作能力尚未对外暴露，但后续可以按受控方式扩展。

## 4.9 设置命令草稿

### `POST /api/command/set`

用途：设置命令草稿，为后续 `run` 提供默认值。

请求体示例：

```json
{
  "target": "localhost",
  "shell": "powershell",
  "command": "Get-Process | Select-Object -First 5"
}
```

示例：

```bash
curl -X POST http://127.0.0.1:8765/api/command/set \
  -H "Content-Type: application/json" \
  -d '{"target":"localhost","shell":"powershell","command":"Get-Process | Select-Object -First 5"}'
```

成功响应：

```json
{
  "target": "localhost",
  "shell": "powershell",
  "command": "Get-Process | Select-Object -First 5",
  "passwordOverride": null
}
```

字段说明：

- `target`: 命令默认目标
- `shell`: 当前实现仅正式支持 `powershell`
- `command`: 草稿命令
- `passwordOverride`: 仅本次草稿 / 执行链路用，不持久化

常见错误：

- `400`

```json
{
  "success": false,
  "error": "command is required"
}
```

## 4.10 运行命令草稿

### `POST /api/command/run`

用途：运行命令。若请求体缺少字段，会按以下顺序补全：

1. 请求体显式值
2. current target session
3. 最近一次命令草稿

请求体可以为空：

```json
{}
```

也可以部分覆盖：

```json
{
  "command": "Get-Date"
}
```

完整示例：

```bash
curl -X POST http://127.0.0.1:8765/api/command/run \
  -H "Content-Type: application/json" \
  -d '{"command":"Get-Date"}'
```

成功响应：

```json
{
  "success": true,
  "stdout": "2026-03-26 17:00:00\r\n",
  "stderr": "",
  "exit_code": 0,
  "target": "localhost",
  "shell": "powershell",
  "command": "Get-Date",
  "raw": {
    "host": "localhost",
    "operation": "exec",
    "success": true,
    "exit_code": 0,
    "stdout": "2026-03-26 17:00:00\r\n",
    "stderr": ""
  }
}
```

常见错误：

- `400`

```json
{
  "success": false,
  "stdout": "",
  "stderr": "No target selected.",
  "exit_code": 1,
  "target": "",
  "shell": "powershell",
  "command": "Get-Date",
  "raw": null
}
```

```json
{
  "success": false,
  "stdout": "",
  "stderr": "Unsupported shell: bash. Only powershell is currently available for Windows targets.",
  "exit_code": 1,
  "target": "localhost",
  "shell": "bash",
  "command": "Get-Date",
  "raw": null
}
```

## 4.11 直接执行命令

### `POST /api/command/execute`

用途：不依赖已有草稿，直接显式指定目标与命令执行。

请求体示例：

```json
{
  "target": "localhost",
  "shell": "powershell",
  "command": "Get-Process | Select-Object -First 5"
}
```

示例：

```bash
curl -X POST http://127.0.0.1:8765/api/command/execute \
  -H "Content-Type: application/json" \
  -d '{"target":"localhost","shell":"powershell","command":"Get-Process | Select-Object -First 5"}'
```

成功响应结构与 `POST /api/command/run` 相同。

常见错误：

- `400`

```json
{
  "success": false,
  "error": "target and command are required"
}
```

- 远端执行失败时：

```json
{
  "success": false,
  "stdout": "",
  "stderr": "Authentication failed",
  "exit_code": 1,
  "target": "lab-win",
  "shell": "powershell",
  "command": "Get-Date",
  "raw": {
    "...": "..."
  }
}
```

## 4.12 最近一次结果

### `GET /api/command/last`

用途：读取最近一次命令执行结果。

示例：

```bash
curl http://127.0.0.1:8765/api/command/last
```

成功响应：

```json
{
  "success": true,
  "result": {
    "success": true,
    "stdout": "...\r\n",
    "stderr": "",
    "exit_code": 0,
    "target": "localhost",
    "shell": "powershell",
    "command": "Get-Date",
    "raw": {
      "...": "..."
    }
  }
}
```

若还没有执行过：

```json
{
  "success": true,
  "result": null
}
```

## 5. 字段映射说明

HTTP 网关对外暴露的字段名，与内部 bridge/service 的字段名并不完全相同。

映射关系如下：

- `host` <-> `hostname`
- `user` <-> `username`
- `auth_type` <-> `authMethod`
- `key_path` <-> `keyPath`
- `note` <-> `description`
- `store_password` <-> `storePassword`

兼容规则：

- HTTP 写入时，这两组名字都可以接受
- HTTP 返回时，网关统一返回外部友好的名字：
  `host / user / auth_type / key_path / note`

## 6. 安全边界

### `passwordOverride`

- 只用于一次性 `probe / execute / run`
- 不写入 `data/hosts.json`
- 适合临时密码输入或一次性认证覆盖

### `password`

- 只有在密码认证且 `store_password=true` 或 `storePassword=true` 时才持久化
- 如果未显式要求持久化，密码不会写入 `data/hosts.json`

### `keyPath`

- 允许通过接口设置
- 会持久化到 `data/hosts.json`

### 默认项目密钥

Windows target 默认优先使用项目内密钥：

`data/ssh/localhost_ed25519`

也就是：

```text
D:\remote-agent-bridge\data\ssh\localhost_ed25519
```

这意味着默认方案优先项目自包含，不依赖当前用户的 `~/.ssh`。

## 7. 持久化说明

会写回 `data/hosts.json` 的接口：

- `POST /api/targets`
- `PUT /api/targets/:name`
- `DELETE /api/targets/:name`

不会写回 `data/hosts.json` 的接口：

- `GET /api/targets/current`
- `POST /api/targets/current`
- `DELETE /api/targets/current`
- `POST /api/probe`
- `POST /api/command/set`
- `POST /api/command/run`
- `POST /api/command/execute`
- `GET /api/command/last`

### current target 是否持久化

当前不会持久化。

它只存在于主进程内存 session：
[sessionService.ts](./desktop-client/src/main/services/sessionService.ts)

客户端退出或主进程重启后，这个状态会丢失。

### UI 与 main session 的同步关系

UI 当前选中的配置变化时，会通过 preload / IPC 同步到 main session。

同时下面这些调用也会更新 current target：

- `POST /api/targets/current`
- `POST /api/probe`
- `POST /api/command/set`（当带 target 时）
- `POST /api/command/run`
- `POST /api/command/execute`

## 8. 推荐调用流程

### 流程 A：新建 target -> 设为 current -> execute

1. `POST /api/targets`
2. `POST /api/targets/current`
3. `POST /api/command/set`
4. `POST /api/command/run`

示例：

```bash
curl -X POST http://127.0.0.1:8765/api/targets \
  -H "Content-Type: application/json" \
  -d '{"name":"lab-win","platform":"windows","host":"192.168.1.50","port":22,"user":"admin","auth_type":"key","key_path":"D:\\remote-agent-bridge\\data\\ssh\\localhost_ed25519","note":"lab machine"}'

curl -X POST http://127.0.0.1:8765/api/targets/current \
  -H "Content-Type: application/json" \
  -d '{"target":"lab-win"}'

curl -X POST http://127.0.0.1:8765/api/command/set \
  -H "Content-Type: application/json" \
  -d '{"shell":"powershell","command":"Get-Date"}'

curl -X POST http://127.0.0.1:8765/api/command/run \
  -H "Content-Type: application/json" \
  -d '{}'
```

### 流程 B：临时指定 target 直接 execute

1. `POST /api/command/execute`

示例：

```bash
curl -X POST http://127.0.0.1:8765/api/command/execute \
  -H "Content-Type: application/json" \
  -d '{"target":"localhost","shell":"powershell","command":"Get-ChildItem D:\\"}'
```

适合不依赖 current target 的一次性调用。

### 流程 C：更新 target -> probe -> execute

1. `PUT /api/targets/:name`
2. `POST /api/probe`
3. `POST /api/command/execute`

示例：

```bash
curl -X PUT http://127.0.0.1:8765/api/targets/localhost \
  -H "Content-Type: application/json" \
  -d '{"name":"localhost","platform":"windows","host":"127.0.0.1","port":22,"user":"38961","auth_type":"key","key_path":"D:\\remote-agent-bridge\\data\\ssh\\localhost_ed25519"}'

curl -X POST http://127.0.0.1:8765/api/probe \
  -H "Content-Type: application/json" \
  -d '{"target":"localhost"}'

curl -X POST http://127.0.0.1:8765/api/command/execute \
  -H "Content-Type: application/json" \
  -d '{"target":"localhost","shell":"powershell","command":"Get-Process | Select-Object -First 5"}'
```

### 流程 D：删除 target

1. `DELETE /api/targets/:name`

示例：

```bash
curl -X DELETE http://127.0.0.1:8765/api/targets/obsolete-host
```

## 9. cURL 示例汇总

下面这些示例都可以直接复制后改值使用：

```bash
curl http://127.0.0.1:8765/health

curl http://127.0.0.1:8765/api/targets

curl http://127.0.0.1:8765/api/targets/localhost

curl http://127.0.0.1:8765/api/targets/current

curl -X POST http://127.0.0.1:8765/api/targets/current \
  -H "Content-Type: application/json" \
  -d '{"target":"localhost"}'

curl -X DELETE http://127.0.0.1:8765/api/targets/current

curl -X POST http://127.0.0.1:8765/api/targets \
  -H "Content-Type: application/json" \
  -d '{"name":"lab-win","platform":"windows","host":"192.168.1.50","port":22,"user":"admin","auth_type":"key","key_path":"D:\\remote-agent-bridge\\data\\ssh\\localhost_ed25519","note":"lab machine"}'

curl -X PUT http://127.0.0.1:8765/api/targets/lab-win \
  -H "Content-Type: application/json" \
  -d '{"name":"lab-win","platform":"windows","host":"192.168.1.60","port":22,"user":"admin","auth_type":"key","key_path":"D:\\remote-agent-bridge\\data\\ssh\\localhost_ed25519","note":"updated note"}'

curl -X DELETE http://127.0.0.1:8765/api/targets/lab-win

curl -X POST http://127.0.0.1:8765/api/probe \
  -H "Content-Type: application/json" \
  -d '{"target":"localhost"}'

curl -X POST http://127.0.0.1:8765/api/command/set \
  -H "Content-Type: application/json" \
  -d '{"target":"localhost","shell":"powershell","command":"Get-Date"}'

curl -X POST http://127.0.0.1:8765/api/command/run \
  -H "Content-Type: application/json" \
  -d '{}'

curl -X POST http://127.0.0.1:8765/api/command/execute \
  -H "Content-Type: application/json" \
  -d '{"target":"localhost","shell":"powershell","command":"Get-Process | Select-Object -First 5"}'

curl http://127.0.0.1:8765/api/command/last
```

在 Windows PowerShell 下，如果 `curl` 被别名到 `Invoke-WebRequest`，优先用 `curl.exe`。

## 10. 错误处理约定

当前网关并没有把所有接口统一包装成同一种 `{ success, data, error, message }` 外壳，而是按接口类型返回不同结构。外部调用方应按下面规则处理：

### 通用规则

- 先看 HTTP 状态码
- 再看 JSON 里的 `success`
- 对执行型接口，再看 `exit_code`

### 目标管理类接口

常见结构：

```json
{
  "success": false,
  "error": "Unknown target: missing-host"
}
```

适用场景：

- 目标不存在
- 参数不合法
- 路由不存在

### probe / execute / run

执行型接口通常返回结构化执行结果。

成功示例：

```json
{
  "success": true,
  "stdout": "...",
  "stderr": "",
  "exit_code": 0,
  "target": "localhost",
  "shell": "powershell",
  "command": "Get-Date",
  "raw": {
    "...": "..."
  }
}
```

失败示例：

```json
{
  "success": false,
  "stdout": "",
  "stderr": "Authentication failed",
  "exit_code": 1,
  "target": "lab-win",
  "shell": "powershell",
  "command": "Get-Date",
  "raw": {
    "...": "..."
  }
}
```

常见失败类型：

- 目标不存在
- 参数不合法
- 认证失败
- SSH 连接失败
- 远端执行失败
- shell 不支持

### 推荐处理方式

对于外部 agent，建议统一按下面顺序处理：

1. HTTP 是否为 `2xx`
2. JSON 是否可解析
3. JSON 顶层 `success` 是否为 `true`
4. 如果存在 `exit_code`，是否为 `0`
5. 失败时优先读取：
   `error` -> `stderr` -> `raw.stderr`

## 11. 当前限制

当前这套网关已经可作为正式调用入口，但仍有几个明确边界：

- current target 仅为进程内 session，不持久化
- 命令执行当前正式支持的 shell 只有 `powershell`
- target 管理已支持 `windows` 和 `android` 的保存，但命令执行主路径当前是 Windows PowerShell 远程执行
- 尚未把 `read-file / list-dir / search-text / workflow` 完整 HTTP 化

如果你准备把它当成长期 agent gateway 使用，下一步最值得补的是：

1. 鉴权
2. 更统一的错误响应结构
3. 文件/目录/workflow API
4. 会话审计与调用日志
