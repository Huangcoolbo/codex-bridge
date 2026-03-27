# 变更日志

本项目的所有重要变更都将记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，并遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Added
- 预留后续版本的变更记录区，新的重要能力、行为调整和修复应先追加到本节，再在发布时整理到具体版本。

## [0.1.0] - 2026-03-27

### Added
- 新增 Electron + React + TypeScript 桌面客户端，提供 Windows、Android、Linux 三个平台入口与桌面化工作台界面。
- 新增本地 HTTP agent gateway，供 Codex / agent 通过正式接口执行 target 管理、probe、命令执行和结果读取。
- 新增 Windows target 管理与会话能力，包括 target 列表、详情、当前 target、probe、命令草稿、执行结果和最近结果接口。
- 新增 Android gateway 只读接口，包括设备列表、设备信息、安全 shell、文件列表、文件读取、文件拉取和当前设备会话。
- 新增 Android gateway 第一批受控写接口，包括 `files/mkdir`、`files/write`、`files/push`，并对路径白名单、写入模式、内容大小和覆盖行为做限制。
- 新增 Android USB 真机接入能力，并完成已连接设备的 target 保存与执行链路验证。
- 新增独立网关文档 [AGENT_GATEWAY.md](./AGENT_GATEWAY.md)，整理可供外部调用的 HTTP API、字段映射、安全边界和推荐调用流程。
- 新增 `docs/GETTING_STARTED*` 和 `docs/DEVELOPMENT*` 文档，将仓库首页、快速上手和开发说明分层。
- 新增 Windows 单文件 portable 打包链路，可生成直接运行的桌面可执行文件。
- 新增运行时路径抽象与启动 bootstrap，使打包后的客户端能够自动准备 Python、ADB、bridge 资源和用户数据目录。
- 新增应用图标资源与 Windows 打包图标配置。

### Changed
- 重构 README，使仓库首页从开发说明书调整为面向用户的产品介绍页，并采用更适合 GitHub 首页阅读的中英文结构。
- 将 GitHub 默认首页调整为中文版本，并保留英文首页入口。
- 调整 README 顶部徽章，增加平台、客户端、gateway、文档、star 和 fork 信息。
- 将桌面客户端的发布名统一为 `Codex.Bridge`，并输出正式 portable 文件名 `Codex.Bridge-v0.1.0.exe`。
- 将 Windows 默认密钥策略调整为优先使用项目内自管密钥，而不是默认依赖当前用户目录下的 `~/.ssh`。
- 将桌面客户端的当前配置、当前 target 和当前 Android 设备状态从 UI 层向主进程能力层收敛，减少 UI 状态与网关状态不一致的问题。

### Fixed
- 修复 GitHub 上 README 与 docs 文档链接使用本地绝对路径导致的失效问题，统一改为仓库相对路径。
- 修复默认中文 README 入口结构冗余问题，去掉多余的中文别名页。
- 修复桌面客户端 preload 路径错误导致的 `window.bridgeDesktop` 注入失败问题。
- 修复平台切换时顶部配置选择区残留上一平台选中状态的问题，确保 Windows / Android / Linux 配置状态按平台隔离。
- 修复客户端任务状态显示中失败态仍带进行中文案的问题，使失败状态与最近任务结果一致。
- 修复 Android `files/push` 在 `overwrite=false` 时的远端存在性判断问题。
- 修复 Android shell 脚本执行包装带来的输出噪音和 shell 兼容性问题。
- 修复桌面客户端在窗口缩小时中间主内容区收缩不足、左右栏跟随整页滚动等布局问题。
- 修复打包后客户端仍依赖开发目录 `process.cwd()` 的路径假设问题，使运行时资源、脚本和数据目录在发布环境中可用。
