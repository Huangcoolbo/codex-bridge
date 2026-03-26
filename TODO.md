# codex-bridge TODO

状态说明：

- [x] 已完成
- [~] 已完成待检验
- [ ] 未开始
- [>] 进行中
- [!] 被阻塞

## 一、当前阶段目标

- [x] 明确项目核心目标：让本地 Codex 通过桥稳定操作远程设备，而不是只做零散脚本
- [x] 明确当前阶段采用并行支持，而不是替换旧路径
- [x] 保留现有 Windows + SSH 路径
- [x] 新增 Android + ADB 路径
- [~] 当前代码层面已具备 Windows + SSH、Android + ADB 两条链路，待真实设备联调验证

## 二、执行原则

### 2.1 架构原则

- [x] 保持“平台能力”和“连接方式”解耦，避免把 Windows/SSH 写死在主流程里
- [x] 保持模块边界：`CLI / Service / Factory / Provider / Adapter / Remote Execution Side`
- [x] 用 `ProviderFactory` 按 `platform + transport` 组合装配执行链路
- [x] 新增 Android 能力优先收敛在 `providers/android.py` 和 `adapters/adb.py` 内，不扩散改动 `service/cli` 主流程

### 2.2 推进原则

- [x] 不先继续铺新平台，优先把现有两条链路理顺
- [>] 先做真实设备联调，再决定后续 Android 收敛项
- [ ] 联调完成前，不把 Android 辅助脚本、无线 ADB、上传下载、Linux 路线放到实现优先级前面

## 三、文档与规划

- [x] 编写项目设计说明（中文）
- [x] 编写项目设计说明（英文）
- [x] README 增加中文版本
- [x] README 快速开始改为优先使用脚本
- [x] 同步更新规划文档，使其反映“Windows + SSH / Android + ADB 并行支持”现状
- [x] 补充真实设备联调记录模板，避免后续验证结果散落在聊天记录里
- [ ] 补充 Android 接入说明（USB / 无线 ADB / 设备授权前提）

## 四、基础骨架与模块装配

- [x] 创建 Python 项目基础结构
- [x] 建立主机资料模型
- [x] 建立主机资料本地存储
- [x] 建立命令入口
- [x] 建立调度层
- [x] 建立 Windows + SSH 执行骨架
- [x] 建立 Android + ADB 执行骨架
- [x] CLI `host add` 支持 Android/ADB 主机资料录入，并默认用户名为 `shell`

## 五、当前能力清单

### 5.1 Windows + SSH

- [x] 能保存远程 Windows 主机信息
- [x] 能列出远程 Windows 主机信息
- [~] 能稳定检查远程 Windows 主机是否可连
- [~] 能向远程 Windows 发送 PowerShell 命令
说明：已补 UTF-8 输出、Stop 失败语义、原生命令退出码传递、本地脚本文件直送，待真实远程验证
- [~] 能稳定读取远程文件
说明：已补文件存在性/目录误读保护，并返回内容 + 元数据，待真实远程验证
- [~] 能稳定列出远程目录
说明：已补目录存在性/文件误传保护、空目录稳定返回、目录元数据与条目类型，待真实远程验证
- [~] 能稳定写入远程文件
说明：已补父路径为文件/目标为目录保护，并返回 `path / bytes / last_write_time`，待真实远程验证
- [~] 能稳定搜索远程文本
说明：已补文件/目录统一搜索入口、文件数/命中数/命中行结构化返回与路径不存在保护，待真实远程验证
- [~] 能获取结构化远程系统信息
说明：已补 Windows `system-info` 命令、脚本、测试与文档，待真实远程验证

### 5.2 Android + ADB

- [x] 能保存 Android 设备资料（使用 adb serial 作为 `hostname`）
- [x] 能通过本地 adb 建立 Android 命令通道
- [~] 能检查 Android 设备是否可连
说明：代码已支持 `probe`，待真实设备验证
- [~] 能执行 Android shell 命令
说明：支持 `cwd` 与超时透传，待真实设备验证
- [~] 能读取 Android 文本文件
说明：当前通过 `base64 + adb shell`，待真实设备验证
- [~] 能列出 Android 目录内容
- [~] 能写入 Android 文本文件
说明：当前通过 `adb push`，待真实设备验证
- [~] 能搜索 Android 文件或目录树中的文本
- [~] 能获取 Android 结构化系统信息
说明：当前返回 `manufacturer / model / sdk / serial / cpu_abi` 等字段，待真实设备验证

### 5.3 统一结果结构与工作流能力

- [x] 所有远程操作返回统一 JSON 结构
- [x] `workflow` 失败时保留已完成步骤和失败步骤
- [x] 修正 `workflow` 对 provider 抛异常时丢失上下文的问题
- [x] 收紧 `workflow` 模板语法校验，避免错误表达式被静默接受
- [x] 保持 Windows/Android 两条链路对上层 `service/cli` 的调用方式一致
- [~] 让桥更像“远程执行通道”而不是零散工具集合
说明：已补 `exec --cwd / --command-file`、`search-text` 与 `workflow` 多步顺序执行；待真实远程验证
- [~] 让 Codex 可以连续调用桥完成多步远程操作
说明：已补 `workflow`、模板变量、`| to-json` 过滤器与失败时保留上下文；待真实远程闭环验证

## 六、本地回归与代码质量

- [x] 基础测试可运行
- [x] 在 Python 3.13 环境下跑完整测试
- [x] 为 Windows/SSH 补 provider / service / CLI 回归测试
- [x] 为 Android/ADB 补 provider / CLI 回归测试

## 七、真实联调计划

### 7.1 Windows + SSH 联调

- [ ] 用真实远程 Windows 主机跑通一次检查流程
- [ ] 用真实远程 Windows 主机跑通一次远程命令执行
- [ ] 用真实远程 Windows 主机跑通一次远程文件读取
- [ ] 用真实远程 Windows 主机跑通一次远程目录查看
- [ ] 用真实远程 Windows 主机跑通一次远程文本搜索
- [ ] 用真实远程 Windows 主机跑通一次远程系统信息采集
- [ ] 用真实远程 Windows 主机跑通一次 `workflow` 最小闭环

### 7.2 Android + ADB 联调

- [ ] 用真实 Android 设备跑通一次 `adb devices` 检查
- [ ] 用真实 Android 设备跑通一次 `probe`
- [ ] 用真实 Android 设备跑通一次 `exec`
- [ ] 用真实 Android 设备跑通一次 `read-file`
- [ ] 用真实 Android 设备跑通一次 `list-dir`
- [ ] 用真实 Android 设备跑通一次 `write-file`
- [ ] 用真实 Android 设备跑通一次 `search-text`
- [ ] 用真实 Android 设备跑通一次 `system-info`
- [ ] 用真实 Android 设备跑通一次最小 `workflow` 闭环

## 八、联调后优先收敛项

- [ ] 根据真机结果修正 Android 文件时间探测差异
- [ ] 根据真机结果修正 Android 权限路径差异
- [ ] 根据真机结果修正 Android 编码与换行差异
- [ ] 根据真机结果修正 Android shell / toybox / grep / stat 差异
- [ ] 把真实联调结论回写到文档，及时把 `[~]` 收敛为 `[x]` 或回退为 `[!]`

## 九、联调稳定后再做的事

- [ ] 设计 Android 辅助脚本（如 `add-android-device.ps1` / `probe-android-device.ps1`）
- [ ] 补 Android 无线 ADB 接入说明和验证步骤
- [ ] 为 Windows 与 Android 补上传/下载等更完整的文件能力
- [ ] 设计 Linux 路线，但暂不实现，先把现有两条链路跑稳

