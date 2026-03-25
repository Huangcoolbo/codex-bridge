# codex-bridge 中文说明

[English README](./README.md)

`codex-bridge` 是一个用 Python 写的最小可用项目，目标是让本地电脑用统一的方式去连接和操作远程机器。

当前第一步已经做的是：**通过 OpenSSH 远程操作 Windows 电脑**。

后面可以继续扩展到：
- Linux
- Android 手机

## 现在已经能做什么

目前这个项目已经支持这些事情：

- 保存远程主机资料
- 列出已经保存的主机
- 检查远程 Windows 是否能连通
- 在远程 Windows 上执行命令，支持直接传命令或读取本地 PowerShell 脚本文件
- 读取远程文件
- 获取远程系统信息
- 列出远程目录内容
- 写入远程文件
- 在远程文件或目录树里搜索文本
- 用一个本地 JSON 工作流文件顺序执行多步远程操作
- 所有远程操作返回统一 JSON 结果结构，方便后续继续处理

## 使用前提

你需要准备这些条件：

- 本地电脑装好 Python
- 远程 Windows 电脑已经开启 OpenSSH Server
- 你有那台 Windows 电脑的可登录账号
- 你知道它的 IP、账号、密码或密钥
- 远程电脑能从当前网络访问到

## 安装

```bash
python -m venv .venv
. .venv/Scripts/activate
pip install -e .
pip install pytest
```

现在仓库里已经补了 `pytest.ini` 和 `tests/conftest.py`，新环境里直接跑 `pytest` 就能收集到 `src` 目录下的代码，不需要再手动设置 `PYTHONPATH=src`。

## 快速开始

常用流程现在已经整理成现成脚本了，直接运行就行。

目前已经有这些脚本：

- `scripts/init.ps1`
- `scripts/add-windows-host.ps1`
- `scripts/list-hosts.ps1`
- `scripts/probe-host.ps1`
- `scripts/exec-remote.ps1`
- `scripts/read-remote-file.ps1`
- `scripts/system-info.ps1`
- `scripts/list-remote-dir.ps1`
- `scripts/write-remote-file.ps1`
- `scripts/search-remote-text.ps1`
- `scripts/run-remote-workflow.ps1`

### 1. 初始化本地环境

这个脚本默认会用 **Python 3.13** 来创建项目环境；如果目录里已经有旧环境，它会先删掉再重建。

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\init.ps1
```

### 2. 添加一台远程 Windows（密钥方式）

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\add-windows-host.ps1 `
  -Name lab-win `
  -HostName 192.168.1.50 `
  -UserName admin `
  -Auth key `
  -KeyPath C:\Users\you\.ssh\id_ed25519
```

### 3. 查看已经保存的主机

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\list-hosts.ps1
```

### 4. 检查远程主机是否可用

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\probe-host.ps1 -Name lab-win
```

### 5. 如果你想直接用命令行

现在这些远程操作命令都会返回统一的 JSON 结构，里面会带上：

- 主机名
- 操作类型
- 是否成功
- 退出码
- 原始 stdout/stderr
- 操作目标
- 结构化 data

其中 `read-file` 现在除了文件内容，还会一起返回：

- 远程规范路径
- 编码
- 文件大小
- 最后修改时间

这样本地 Codex 读取完文件后，可以直接决定下一步，不必再额外补一次文件信息查询。

其中 `system-info` 现在会一次返回远程 Windows 的关键环境信息，比如：

- 当前用户
- 系统版本
- 内存大小
- IPv4 地址
- 本地磁盘信息

这样本地 Codex 在开始排查或执行多步操作前，可以先判断远程机器的大致环境。

其中 `search-text` 现在会在单个远程文件或整个目录树里做字面量文本搜索，并返回带文件路径和行号的结构化匹配结果，方便本地 Codex 先搜再决定下一步读哪个文件。

其中 `workflow` 现在可以一次读取本地 JSON 工作流文件，按顺序执行多步远程操作，并把每一步都作为独立结构化结果返回，更适合做 search -> read-file -> system-info 这种小闭环。

现在 `workflow` 里的后续步骤还可以通过 `{{ ... }}` 直接引用前面步骤返回的数据，比如先搜索出命中文件，再把这个路径直接喂给下一步 `read-file`，不用事先把路径写死。

其中 `exec` 现在还支持先切换到一个经过校验的远程工作目录再执行命令，也支持先读取本地 PowerShell 脚本文件再发送到远程执行，更适合连续多步操作。

在远程 Windows 上执行命令：

```bash
codex-bridge exec lab-win -- "Get-Process | Select-Object -First 5"
```

先切到远程工作目录再执行命令：

```bash
codex-bridge exec --cwd C:\Temp lab-win -- "Get-ChildItem"
```

把本地 PowerShell 脚本文件发送到远程执行：

```bash
codex-bridge exec --cwd C:\Temp --command-file .\ops.ps1 lab-win
```

读取远程文件：

```bash
codex-bridge read-file lab-win C:\Windows\System32\drivers\etc\hosts
```

获取远程系统信息：

```bash
codex-bridge system-info lab-win
```

查看远程目录：

```bash
codex-bridge list-dir lab-win C:\Users\Public
```

在单个文件或目录树里搜索文本：

```bash
codex-bridge search-text lab-win C:\Logs ERROR --recurse
```

从本地 JSON 工作流文件执行多步远程操作：

```bash
codex-bridge workflow lab-win --workflow-file .\workflow.json
```

`workflow.json` 示例：

```json
[
  {"operation": "search-text", "path": "C:\\Logs", "pattern": "ERROR", "recurse": true},
  {"operation": "read-file", "path": "{{ steps[0].data.matches[0].path }}"},
  {"operation": "exec", "cwd": "C:\\Logs", "command": "Write-Output 'first hit: {{ steps[0].data.matches[0].line_number }}'"},
  {"operation": "system-info"}
]
```

当前模板表达式从 `steps` 开始取值，例如：

- `{{ steps[0].data.matches[0].path }}`
- `{{ steps[1].target.path }}`
- `prefix={{ steps[0].operation }}`

现在模板表达式还支持简单的 `| to-json` 过滤器，适合把前一步的结构化结果直接转成一整段 JSON 字符串，再写入远程文件或喂给后续命令，例如：

- `{{ steps[0].data | to-json }}`
- `{{ steps[2].data.matches | to-json }}`

`search-text` 返回的结构里会带上：

- 实际搜索的路径
- 是否是目录
- 是否递归
- 扫描了多少个文件
- 命中了多少处
- 每一处命中的文件路径、行号、文本内容

这样本地侧可以先搜，再读真正需要的文件，减少盲读和试错。

写入远程文件：

```bash
codex-bridge write-file lab-win C:\Temp\notes.txt --content "hello from codex-bridge"
```

## 主机资料保存在哪里

主机资料默认保存在：

- `data/hosts.json`

## 目前的限制

现在这是第一版，所以先把重点放在“能稳定连上并完成基础操作”。

暂时还没有这些能力：

- 上传文件
- 下载文件
- 管理 Windows 服务
- 同时支持 Linux
- 同时支持 Android
- 更安全的密码存储方式

## 接下来适合做什么

下一步比较适合补这些：

1. 上传和下载文件
2. 更完整的 Windows 操作能力
3. Linux 支持
4. Android 支持
5. 更安全的凭据保存方式
