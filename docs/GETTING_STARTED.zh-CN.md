# 快速上手

如果你已经知道 `Codex.Bridge` 是什么，只想尽快跑起来，这份文档给你最短路径。

如果你还需要先看产品定位，先读：
[README.md](../README.md)

## 1. 先看整体路径

```text
准备本地环境
   |
   v
准备至少一个远程目标
   |
   v
启动桌面客户端
   |
   v
确认本地 gateway 在线
   |
   v
发起 probe / execute
```

## 2. 准备本地环境

在项目根目录运行：

```bash
python -m venv .venv
. .venv/Scripts/activate
pip install -e .
pip install pytest
```

如果你的目标只是启动桌面客户端，也可以直接走：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\launch-bridge-client.ps1
```

这条脚本会把桌面客户端拉起来，并准备本地运行时。

## 3. 准备一个目标

### 3.1 Windows

前置条件：

```text
目标 Windows 已开启 OpenSSH Server
   |
   +--> 你有可登录账号
   +--> 本机可访问目标 IP
   +--> 你已经准备好密码或私钥
```

添加一台 Windows 主机：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\add-windows-host.ps1 `
  -Name lab-win `
  -HostName 192.168.1.50 `
  -UserName admin `
  -Auth key `
  -KeyPath D:\remote-agent-bridge\data\ssh\localhost_ed25519
```

### 3.2 Android

前置条件：

```text
本机已安装 Android platform-tools
   |
   +--> 手机已开启 USB 调试或无线调试
   +--> adb 可以识别设备
```

用脚本检查 `adb`、发现设备并保存：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-android-device.ps1 `
  -InstallPlatformTools `
  -DeviceName pixel `
  -Probe
```

## 4. 启动桌面客户端

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\launch-bridge-client.ps1
```

启动后会同时带起：

```text
桌面客户端
   +
本地 agent gateway
   |
   v
http://127.0.0.1:8765
```

## 5. 做最小验证

### 5.1 先看网关是否在线

```bash
curl http://127.0.0.1:8765/health
```

### 5.2 看已保存目标

```bash
curl http://127.0.0.1:8765/api/targets
```

### 5.3 探测一个目标

```bash
curl -X POST http://127.0.0.1:8765/api/probe ^
  -H "Content-Type: application/json" ^
  -d "{\"target\":\"localhost\"}"
```

### 5.4 执行一条命令

```bash
curl -X POST http://127.0.0.1:8765/api/command/execute ^
  -H "Content-Type: application/json" ^
  -d "{\"target\":\"localhost\",\"shell\":\"powershell\",\"command\":\"Get-Date\"}"
```

## 6. Android 最小入口

Android 已开放的正式 HTTP API 见：
[AGENT_GATEWAY.md](../AGENT_GATEWAY.md)

最常见的入口是：

```text
GET  /api/android/devices
GET  /api/android/devices/:serial/info
POST /api/android/devices/:serial/files/list
POST /api/android/devices/:serial/files/read
POST /api/android/devices/:serial/files/mkdir
POST /api/android/devices/:serial/files/write
POST /api/android/devices/:serial/files/push
```

## 7. 出问题先看哪里

```text
如果客户端起不来
  -> docs/DEVELOPMENT.zh-CN.md

如果要看接口细节
  -> AGENT_GATEWAY.md

如果要看架构层说明
  -> PROJECT_DESIGN.zh-CN.md

如果要看真实设备是否已经跑通
  -> REAL_DEVICE_VALIDATION.zh-CN.md
```
