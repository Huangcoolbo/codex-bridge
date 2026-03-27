# codex-bridge

[![Platform](https://img.shields.io/badge/platform-Windows%20%2B%20Android-16A34A)](./AGENT_GATEWAY.md)
[![Desktop](https://img.shields.io/badge/client-Electron%20%2B%20React-111827)](./desktop-client)
[![Gateway](https://img.shields.io/badge/gateway-Local%20HTTP%20API-0F766E)](./AGENT_GATEWAY.md)
[![Docs](https://img.shields.io/badge/docs-Getting%20Started-2563EB)](./docs/GETTING_STARTED.zh-CN.md)
[![GitHub stars](https://img.shields.io/github/stars/Huangcoolbo/codex-bridge?style=flat)](https://github.com/Huangcoolbo/codex-bridge/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/Huangcoolbo/codex-bridge?style=flat)](https://github.com/Huangcoolbo/codex-bridge/network/members)

[English README](./README.en.md)

> 让 Codex 不只是“告诉你怎么做”，而是真的去连接、探测、读取、执行、写入远程 Windows 和 Android。

## ✨ 这是什么

`codex-bridge` 是一个给 Codex / agent 用的本地远程执行网关。

它把这些原本零散的东西收成一套正式能力：

- Windows: SSH + PowerShell
- Android: ADB + 受控 API
- Electron 桌面客户端
- 本地 HTTP gateway

它不是远程桌面，也不是单纯的 SSH/ADB 命令包装器。  
它更像是：

- 用户负责提需求
- Codex 负责理解和决策
- `codex-bridge` 负责把动作送到正确的远程目标

## 🤔 它解决什么问题

如果没有这类桥接层，很多“让 AI 帮我处理远程系统”的需求，最后都会退化成：

- 你自己切 SSH、切 adb
- 你自己复制命令、粘贴结果
- AI 只负责出主意，不能稳定执行
- 一堆脚本散落在本地，没人知道下一次该走哪条链路

`codex-bridge` 做的事很直接：

- 把目标统一注册
- 把操作统一暴露成正式接口
- 把结果统一返回成结构化数据
- 让 Codex 可以连续调用，而不是每次重新“手工接线”

## 👤 适合谁

- 想让 Codex 真正操作远程设备的人
- 同时有 Windows 和 Android 目标的人
- 不想把工作流拆在终端、脚本、SSH、ADB 历史里的用户
- 想先从本地网关开始，后续再扩 Linux 或更多平台的人

## 🧠 Codex 在里面扮演什么角色

这个项目的核心分工是：

- Codex 负责思考
- `codex-bridge` 负责连接和执行
- 远程设备负责真正返回结果

所以你可以把它理解成：

- Codex 是脑子
- `codex-bridge` 是手臂
- Windows / Android 是被操作的真实对象

## 🚀 用户怎么使用

最短流程只有 3 步：

1. 启动桌面客户端
2. 保存一台 Windows 主机或 Android 设备
3. 让 Codex 通过本地 gateway 去探测、读取、执行或写入

你不需要每次自己：

- 手切 SSH
- 手打 adb shell
- 手工抄路径
- 手动把 stdout/stderr 回贴给 Codex

### 先把客户端跑起来

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\launch-bridge-client.ps1
```

启动后你会得到两样东西：

- 一个给人调试和配置目标的桌面客户端
- 一个给 Codex / agent 调用的本地 gateway：`http://127.0.0.1:8765`

如果你要完整安装和启动流程，去：
[快速上手](./docs/GETTING_STARTED.zh-CN.md)

## 📦 当前已经能做什么

### Windows

- 保存目标
- 探测连接
- 执行 PowerShell
- 读取结构化结果

### Android

- 列出设备
- 读取设备信息
- 列目录
- 读文件
- 创建目录
- 写文本文件
- 推送本地文件

### Gateway

- 列出 target
- 设置 current target / current Android device
- probe
- execute
- last result

## 🧪 典型场景

### 1. 检查 Windows 机器状态

用户说：  
“帮我看看这台 Windows 机器为什么跑不起来。”

Codex 可以：

- 找到 target
- 探测连接
- 执行 PowerShell
- 拿回 `stdout / stderr / exit_code`

### 2. 读取 Android 手机上的文件

用户说：  
“看看我手机 Download 目录下有什么。”

Codex 可以：

- 列设备
- 读取设备信息
- 列目录
- 读取文件

### 3. 在 Android 上做受控写入

用户说：  
“在手机 Documents 里建一个工作目录，再写一份说明文件。”

Codex 现在已经可以正式调用：

- `files/mkdir`
- `files/write`
- `files/push`

而且这些写操作是受控的，不是直接裸放任意 `adb shell`。

## 🏗️ 技术架构

```text
User
  |
  v
Codex
  |
  v
codex-bridge Desktop Client
  |
  +--> Renderer (human UI)
  |
  +--> Electron Main
         |
         +--> Local HTTP Gateway
         |      |
         |      +--> Target management
         |      +--> Probe / Execute
         |      +--> Android controlled APIs
         |
         +--> Service layer
                |
                +--> Windows bridge -> SSH -> PowerShell
                |
                +--> Android bridge -> ADB -> controlled file/device actions
```

## 🔌 为什么它比手工 SSH / ADB 更适合

- 它给 Codex 的是正式接口，不是“你去终端里敲一下”
- 它把目标、状态、结果组织成了统一模型
- 它既支持人类 UI 调试，也支持 agent 程序化调用
- 它对 Android 写能力做了边界控制，不是一上来就开放高风险 raw shell
- 它的架构天然适合继续扩 Linux

## 📚 文档入口

- 快速上手：
  [docs/GETTING_STARTED.zh-CN.md](./docs/GETTING_STARTED.zh-CN.md)
- Gateway 接口：
  [AGENT_GATEWAY.md](./AGENT_GATEWAY.md)
- 变更日志：
  [CHANGELOG.md](./CHANGELOG.md)
- 项目设计：
  [PROJECT_DESIGN.zh-CN.md](./PROJECT_DESIGN.zh-CN.md)
- 开发说明：
  [docs/DEVELOPMENT.zh-CN.md](./docs/DEVELOPMENT.zh-CN.md)
- 真实联调状态：
  [REAL_DEVICE_VALIDATION.zh-CN.md](./REAL_DEVICE_VALIDATION.zh-CN.md)

## 📍 当前状态

当前仓库已经不是纯概念验证：

- Windows 本机 SSH 探测和执行链路已通
- Android USB 调试链路已通
- Android gateway 已支持只读 + 第一批受控写接口
- Electron 客户端和 HTTP gateway 共用同一套底层逻辑

## 🛣️ 下一步

- Android `files/delete`
- Android `input tap / input text`
- Linux 路径
- 更完整的安全策略和会话控制
