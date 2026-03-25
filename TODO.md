# codex-bridge TODO

状态说明：

- [x] 已完成
- [~] 已完成待检验
- [ ] 未开始
- [>] 进行中
- [!] 被阻塞

## 一、项目方向与文档

- [x] 明确项目第一阶段目标：让本地 Codex 通过桥操作远程 Windows
- [x] 明确三模块结构：本地 Codex / 桥 / 远程 PowerShell 执行层
- [x] 编写项目设计说明（中文）
- [x] 编写项目设计说明（英文）
- [x] README 增加中文版本
- [x] README 快速开始改为优先使用脚本

## 二、基础项目骨架

- [x] 创建 Python 项目基础结构
- [x] 建立主机资料模型
- [x] 建立主机资料本地存储
- [x] 建立命令入口
- [x] 建立调度层
- [x] 建立 Windows + SSH 的基础执行骨架

## 三、本地脚本工具

- [x] 初始化脚本 init.ps1
- [x] 添加 Windows 主机脚本 add-windows-host.ps1
- [x] 查看主机脚本 list-hosts.ps1
- [x] 检查主机脚本 probe-host.ps1
- [x] 远程执行命令脚本 exec-remote.ps1
- [x] 远程读文件脚本 read-remote-file.ps1
- [x] 远程列目录脚本 list-remote-dir.ps1
- [x] 远程写文件脚本 write-remote-file.ps1
- [x] 远程文本搜索脚本 search-remote-text.ps1
- [x] init.ps1 默认切换到 Python 3.13
- [~] 所有脚本在新环境下完整联调一次

## 四、桥的核心能力（第一阶段）

- [x] 能保存远程 Windows 主机信息
- [x] 能列出远程 Windows 主机信息
- [~] 能稳定检查远程 Windows 主机是否可连
- [~] 能向远程 Windows 发送 PowerShell 命令（已补 UTF-8 输出、Stop 失败语义与本地脚本文件直送，待真实远程验证）
- [~] 能稳定读取远程文件（已补文件存在性/目录误读保护，返回内容+元数据，待真实远程验证）
- [~] 能稳定列出远程目录（已补目录存在性/文件误传保护、空目录稳定返回、目录元数据与条目类型，待真实远程验证）
- [~] 能稳定写入远程文件（已补父路径为文件/目标为目录保护，补写后 path/bytes/last_write_time 返回，待真实远程验证）
- [~] 能稳定搜索远程文本（已补文件/目录统一搜索入口、文件数/命中数/命中行结构化返回与路径不存在保护，待真实远程验证）
- [x] 能把执行结果整理成清晰统一的返回结构

## 五、围绕 Codex 破界的能力

- [>] 让桥更像“远程执行通道”而不是零散工具集合（已补 exec --cwd/--command-file 与 search-text）
- [>] 让 Codex 可以连续调用桥完成多步远程操作（已补 exec --cwd/--command-file，可先 search-text 再 read-file；待真实远程闭环验证）
- [x] 设计更清晰的远程执行结果结构，方便 Codex 继续下一步
- [~] 明确“命令执行 / 文件读取 / 目录查看 / 文本搜索”的统一调用方式（结果结构已统一，CLI 交互层还可继续抽象）

## 六、检验与验收

- [x] 基础测试可运行
- [x] 在 Python 3.13 环境下跑完整测试
- [ ] 用真实远程 Windows 主机跑通一次检查流程
- [ ] 用真实远程 Windows 主机跑通一次远程命令执行
- [ ] 用真实远程 Windows 主机跑通一次远程文件读取
- [ ] 用真实远程 Windows 主机跑通一次远程文本搜索
- [ ] 用真实远程 Windows 主机跑通一次“Codex 通过桥连续操作”的最小闭环

## 七、下一步优先顺序

- [>] 继续改代码：把桥的核心能力往“稳定远程执行 PowerShell 命令”推进
- [>] 继续优化错误提示，让失败原因更直白（下一步优先做真实远程验证）
- [x] 为 exec 增加远程工作目录能力并补测试（已发现并修正 CLI 参数顺序陷阱，pytest 已通过）
- [x] 为 exec 增加 --command-file 与脚本入口，并补 CLI 测试（支持本地多行 PowerShell 脚本直送）
- [x] 补齐 search_text 抽象接口并落地 Windows provider / CLI / 脚本 / 测试
- [ ] 真实远程验证并更新状态
- [ ] 用真实远程 Windows 主机验证 exec --command-file + --cwd 的多步脚本执行闭环
- [ ] 用真实远程 Windows 主机验证 search-text 的单文件 / 空目录 / 目录递归 / 无命中 / 路径不存在几种结果是否符合预期
- [ ] 用真实远程 Windows 主机验证 list-dir 的目录不存在 / 误传文件 / 空目录 / 普通目录四种结果是否符合预期
