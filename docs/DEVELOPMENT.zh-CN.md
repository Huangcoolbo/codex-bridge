# 开发与实现说明

这份文档面向需要继续开发 `codex-bridge` 的人。

如果你只是想知道项目是什么、怎么用，先看：
[README.zh-CN.md](/D:/remote-agent-bridge/README.zh-CN.md)

## 代码结构

- Python bridge：
  [src/remote_agent_bridge](/D:/remote-agent-bridge/src/remote_agent_bridge)
- Electron 客户端：
  [desktop-client](/D:/remote-agent-bridge/desktop-client)
- 网关文档：
  [AGENT_GATEWAY.md](/D:/remote-agent-bridge/AGENT_GATEWAY.md)

## 当前主能力

- Windows + SSH + PowerShell
- Android + ADB
- Electron 桌面客户端
- 本地 HTTP gateway，给 Codex / agent 程序化调用

## 测试

Python：

```bash
python -m pytest -q
```

桌面客户端：

```powershell
cd .\desktop-client
npm run typecheck
node --test --experimental-strip-types .\tests\androidGatewayService.test.ts
npm run build
```

## 资料与状态

- 主机注册表：
  [data/hosts.json](/D:/remote-agent-bridge/data/hosts.json)
- 真实设备联调：
  [REAL_DEVICE_VALIDATION.zh-CN.md](/D:/remote-agent-bridge/REAL_DEVICE_VALIDATION.zh-CN.md)
- 项目设计：
  [PROJECT_DESIGN.zh-CN.md](/D:/remote-agent-bridge/PROJECT_DESIGN.zh-CN.md)

## 当前说明

- README 首页已改成产品介绍页
- 安装、启动、最小调用流程放在：
  [docs/GETTING_STARTED.zh-CN.md](/D:/remote-agent-bridge/docs/GETTING_STARTED.zh-CN.md)
- 网关接口细节放在：
  [AGENT_GATEWAY.md](/D:/remote-agent-bridge/AGENT_GATEWAY.md)
