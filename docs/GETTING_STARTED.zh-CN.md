# 快速上手

## 这份文档适合谁

如果你已经知道 `codex-bridge` 是什么，只想尽快跑起来，这份文档给你最短路径。

如果你还不确定它解决什么问题，先看仓库首页：
[README.zh-CN.md](/D:/remote-agent-bridge/README.zh-CN.md)

## 1. 安装

```bash
python -m venv .venv
. .venv/Scripts/activate
pip install -e .
pip install pytest
```

## 2. 准备远程目标

### Windows

- 远程 Windows 已开启 OpenSSH Server
- 你有可登录账号
- 本机能访问目标 IP

添加一台 Windows 主机：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\add-windows-host.ps1 `
  -Name lab-win `
  -HostName 192.168.1.50 `
  -UserName admin `
  -Auth key `
  -KeyPath D:\remote-agent-bridge\data\ssh\localhost_ed25519
```

### Android

- 本机已安装 Android platform-tools
- 手机已开启 USB 调试或无线调试

用脚本检查 adb、发现设备并保存：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-android-device.ps1 `
  -InstallPlatformTools `
  -DeviceName pixel `
  -Probe
```

## 3. 启动桌面客户端

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\launch-bridge-client.ps1
```

桌面客户端启动后，会同时带起本地 agent gateway：

```text
http://127.0.0.1:8765
```

## 4. 最小调用流程

### 先看网关是否在线

```bash
curl http://127.0.0.1:8765/health
```

### 看已保存目标

```bash
curl http://127.0.0.1:8765/api/targets
```

### 探测一个目标

```bash
curl -X POST http://127.0.0.1:8765/api/probe ^
  -H "Content-Type: application/json" ^
  -d "{\"target\":\"localhost\"}"
```

### 执行一条命令

```bash
curl -X POST http://127.0.0.1:8765/api/command/execute ^
  -H "Content-Type: application/json" ^
  -d "{\"target\":\"localhost\",\"shell\":\"powershell\",\"command\":\"Get-Date\"}"
```

## 5. Android 网关

Android 已开放的正式 HTTP API 见：
[AGENT_GATEWAY.md](/D:/remote-agent-bridge/AGENT_GATEWAY.md)

你可以从这些入口开始：

- `GET /api/android/devices`
- `GET /api/android/devices/:serial/info`
- `POST /api/android/devices/:serial/files/list`
- `POST /api/android/devices/:serial/files/read`
- `POST /api/android/devices/:serial/files/mkdir`
- `POST /api/android/devices/:serial/files/write`
- `POST /api/android/devices/:serial/files/push`

## 6. 更多文档

- 产品首页：
  [README.zh-CN.md](/D:/remote-agent-bridge/README.zh-CN.md)
- 网关接口：
  [AGENT_GATEWAY.md](/D:/remote-agent-bridge/AGENT_GATEWAY.md)
- 项目设计：
  [PROJECT_DESIGN.zh-CN.md](/D:/remote-agent-bridge/PROJECT_DESIGN.zh-CN.md)
- 真实联调状态：
  [REAL_DEVICE_VALIDATION.zh-CN.md](/D:/remote-agent-bridge/REAL_DEVICE_VALIDATION.zh-CN.md)
