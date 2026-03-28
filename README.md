<div align="center">
  <img src="./docs/assets/mengo.png" alt="Codex.Bridge icon" width="72" />
  <h1>Codex.Bridge</h1>

  <p>
    <a href="./docs/GETTING_STARTED.zh-CN.md">快速上手</a> ·
    <a href="./AGENT_GATEWAY.md">Gateway 接口</a> ·
    <a href="./PROJECT_DESIGN.zh-CN.md">项目设计</a> ·
    <a href="./docs/DEVELOPMENT.zh-CN.md">开发说明</a> ·
    <a href="./REAL_DEVICE_VALIDATION.zh-CN.md">真实联调</a> ·
    <a href="./CHANGELOG.md">CHANGELOG</a>
  </p>

  <p><a href="./README.en.md">English README</a></p>

  <p>
    <a href="./AGENT_GATEWAY.md"><img src="https://img.shields.io/badge/platform-Windows%20%2B%20Android-16A34A" alt="Platform" /></a>
    <a href="./desktop-client"><img src="https://img.shields.io/badge/client-Electron%20%2B%20React-111827" alt="Desktop" /></a>
    <a href="./AGENT_GATEWAY.md"><img src="https://img.shields.io/badge/gateway-Local%20HTTP%20API-0F766E" alt="Gateway" /></a>
    <a href="./docs/GETTING_STARTED.zh-CN.md"><img src="https://img.shields.io/badge/docs-Getting%20Started-2563EB" alt="Docs" /></a>
    <a href="https://github.com/Huangcoolbo/codex-bridge/stargazers"><img src="https://img.shields.io/github/stars/Huangcoolbo/codex-bridge?style=flat" alt="GitHub stars" /></a>
    <a href="https://github.com/Huangcoolbo/codex-bridge/network/members"><img src="https://img.shields.io/github/forks/Huangcoolbo/codex-bridge?style=flat" alt="GitHub forks" /></a>
  </p>
</div>

> 让 Codex 不只是“告诉你怎么做”，而是真的去连接、探测、读取、执行、写入远程 Windows 和 Android。

## 1. 这是什么

`Codex.Bridge` 是一个给 Codex / agent 使用的本地远程执行网关。

它不是远程桌面，不是单纯的 SSH/ADB 包装器，也不是只给人手动点界面的管理后台。它做的是另一件事：

```text
用户提出目标
   |
   v
Codex 负责理解与决策
   |
   v
Codex.Bridge 负责连接、探测、读取、执行、写入
   |
   v
Windows / Android 返回真实结果
```

它把原本分散的这些能力收成一套正式入口：

- Windows: SSH + PowerShell
- Android: ADB + 受控 API
- Electron 桌面客户端
- 本地 HTTP gateway

## 2. 你打开它之后会得到什么

启动之后，你会同时得到两样东西：

```text
┌──────────────────────┐
│ Desktop Client       │  给人配置目标、手动调试、看状态与结果
└──────────────────────┘

┌──────────────────────┐
│ Local HTTP Gateway   │  给 Codex / agent 程序化调用
│ http://127.0.0.1:8765│
└──────────────────────┘
```

这两层共用同一套底层逻辑，所以：

- 人在界面里点的动作，和
- Codex 通过本地 gateway 调的动作

本质上走的是同一条执行链路。

## 3. 它解决什么问题

如果没有这类桥接层，很多“让 AI 帮我处理远程系统”的需求，最后会退化成下面这种手工流程：

```text
切 SSH
  -> 复制命令
  -> 粘贴结果
  -> 再切 adb
  -> 再复制路径
  -> 再回贴给 AI
```

`Codex.Bridge` 的作用是把这条零散链路收成稳定入口：

- 目标统一注册
- 操作统一暴露
- 返回统一结构化结果
- Android 写能力按受控方式逐步开放
- 人类 UI 和 agent 调用不再是两套分裂逻辑

## 4. 最短使用路径

先启动客户端：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\launch-bridge-client.ps1
```

然后按这个最短路径使用：

```text
启动客户端
   |
   v
保存一台 Windows 主机或 Android 设备
   |
   v
让 Codex 通过本地 gateway 发起 probe / execute / files 操作
   |
   v
在客户端里看状态、输出和结果
```

如果你只想尽快跑起来，看：
[快速上手](./docs/GETTING_STARTED.zh-CN.md)

## 5. 你在客户端里会看到什么

客户端不是网页式后台表单，而是一个桌面工作台。

```text
┌───────────────┬──────────────────────────┬──────────────────┐
│ 左栏            │ 中间主工作区                │ 右栏               │
├───────────────┼──────────────────────────┼──────────────────┤
│ 总览 / Android │ 发现主机                    │ 当前目标            │
│ Windows / Linux│ 编辑连接参数                 │ 输出与结果           │
│               │ 探测 / 执行 / 文件操作        │                  │
└───────────────┴──────────────────────────┴──────────────────┘
```

当前主路径已经收成：

```text
发现目标
  -> 探测
  -> 成功后保存
  -> 执行命令或文件操作
  -> 查看输出
```

## 6. 当前已经能做什么

### Windows

- 保存目标
- 探测连接
- 执行 PowerShell
- 返回 `stdout / stderr / exit_code`

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
- 读取最近一次结果

## 7. 典型使用场景

### 场景一：检查一台 Windows 主机

```text
用户：帮我看看这台 Windows 机器为什么跑不起来
   |
   v
Codex 选择 target
   |
   v
probe
   |
   v
execute PowerShell
   |
   v
返回 stdout / stderr / exit_code
```

### 场景二：读取 Android 手机上的文件

```text
用户：看看我手机 Download 目录下有什么
   |
   v
Codex 列设备
   |
   v
读取设备信息
   |
   v
列目录 / 读文件
```

### 场景三：在 Android 上做受控写入

```text
用户：在手机 Documents 里建一个工作目录，再写一份说明
   |
   v
Codex 调用 files/mkdir
   |
   v
Codex 调用 files/write 或 files/push
   |
   v
操作限制在受控白名单目录中
```

## 8. 技术结构

```text
User
  |
  v
Codex
  |
  v
Codex.Bridge Desktop Client
  |
  +--> Renderer (human UI)
  |
  +--> Electron Main
         |
         +--> Local HTTP Gateway
         |      |
         |      +--> target management
         |      +--> probe / execute
         |      +--> Android controlled APIs
         |
         +--> Service layer
                |
                +--> Windows bridge -> SSH -> PowerShell
                |
                +--> Android bridge -> ADB -> controlled file/device actions
```

如果你想看更完整的当前架构快照，看：
[项目设计](./PROJECT_DESIGN.zh-CN.md)

## 9. 为什么它比手工 SSH / ADB 更合适

它的优势不在于“多包了一层”，而在于把调用关系整理干净了：

- 给 Codex 的是正式接口，不是“你去终端里敲一下”
- 把目标、状态、结果组织成统一模型
- 同时支持人类 UI 调试和 agent 程序化调用
- 对 Android 写能力有明确边界
- 结构上已经留出了 Linux 扩展空间

## 10. 先读哪份文档

```text
如果你想先跑起来
  -> docs/GETTING_STARTED.zh-CN.md

如果你要接 Codex / agent
  -> AGENT_GATEWAY.md

如果你要真正看懂架构
  -> PROJECT_DESIGN.zh-CN.md

如果你要继续开发
  -> docs/DEVELOPMENT.zh-CN.md

如果你要看真实设备联调状态
  -> REAL_DEVICE_VALIDATION.zh-CN.md
```

## 11. 当前状态

当前仓库已经不是概念验证：

- Windows 本机 SSH 探测与执行链路已通
- Android USB 调试链路已通
- Android gateway 已支持只读 + 第一批受控写接口
- 桌面客户端和 HTTP gateway 共用同一套底层逻辑
- 桌面客户端已支持安装版、自更新检查与安装包交接

## 12. 下一步

```text
Android files/delete
Android input tap / input text
Linux 路径
更完整的安全策略
更完整的会话控制
```
