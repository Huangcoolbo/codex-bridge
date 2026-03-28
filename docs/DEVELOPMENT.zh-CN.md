# 开发说明

这份文档给继续改这个项目的人看。

如果你先想知道项目是什么、给谁用、怎么启动，先看：
[README.md](../README.md)

## 1. 先认清当前代码结构

```text
desktop-client/
  ├─ src/renderer/   界面与交互
  ├─ src/preload/    renderer 和 main 之间的窄桥
  ├─ src/main/       Electron main、gateway、update、tray、startup
  └─ release/        打包产物

src/remote_agent_bridge/
  ├─ service.py      bridge 主入口
  ├─ factory.py      provider / adapter 组装
  ├─ adapters/       SSH / ADB
  └─ providers/      Windows / Android

scripts/
  ├─ launch-bridge-client.ps1
  ├─ bootstrap-client-runtime.ps1
  └─ authorize-managed-ssh-key.ps1
```

## 2. 当前系统怎么分层

```text
Renderer
  -> 负责人类界面

Preload
  -> 负责给 renderer 暴露受控 API

Electron Main
  -> 负责 IPC、HTTP gateway、update、tray、startup

Service Layer
  -> 负责 target 管理、probe、execute、Android gateway

Python Bridge
  -> 负责真正跨 SSH / ADB 执行动作
```

如果你需要完整架构快照，看：
[PROJECT_DESIGN.zh-CN.md](../PROJECT_DESIGN.zh-CN.md)

## 3. 当前最重要的主路径

### 3.1 桌面客户端主路径

```text
Renderer
  -> Preload
  -> Electron Main
  -> bridgeService / automationService / androidGatewayService
  -> Python bridge 或 ADB service
  -> 远程目标
```

### 3.2 Agent 网关主路径

```text
Codex / external caller
  -> Local HTTP Gateway
  -> Electron Main services
  -> Python bridge / Android gateway
  -> Windows / Android
```

## 4. 开发时最常看的目录

- Python bridge：
  [src/remote_agent_bridge](../src/remote_agent_bridge)
- Electron 客户端：
  [desktop-client](../desktop-client)
- Gateway 文档：
  [AGENT_GATEWAY.md](../AGENT_GATEWAY.md)
- 项目设计：
  [PROJECT_DESIGN.zh-CN.md](../PROJECT_DESIGN.zh-CN.md)

## 5. 当前核心能力

```text
Windows
  -> SSH + PowerShell

Android
  -> ADB + controlled APIs

Desktop
  -> Electron client

Gateway
  -> local HTTP API for Codex / agents
```

## 6. 测试与构建

### 6.1 Python

```bash
python -m pytest -q
```

### 6.2 Desktop Client

```powershell
cd .\desktop-client
npm run typecheck
node --test --experimental-strip-types .\tests\androidGatewayService.test.ts
npm run build
```

如果要打 Windows 安装包：

```powershell
cd .\desktop-client
npm run dist:win
```

## 7. 开发时最常看的状态文件

```text
data/hosts.json
  -> 已保存 target

CHANGELOG.md
  -> 版本变化

REAL_DEVICE_VALIDATION.zh-CN.md
  -> 真实设备联调状态
```

## 8. 文档应该怎么读

```text
先看 README
  -> 知道项目定位

再看 GETTING_STARTED
  -> 知道最小可用路径

再看 AGENT_GATEWAY
  -> 知道正式接口

再看 PROJECT_DESIGN
  -> 知道分层、数据流、设计判断

最后看 REAL_DEVICE_VALIDATION
  -> 知道真实目标到底跑到了哪一步
```
