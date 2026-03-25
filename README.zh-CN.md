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
- 在远程 Windows 上执行命令
- 读取远程文件
- 列出远程目录内容
- 写入远程文件
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
```

## 快速开始

常用流程现在已经整理成现成脚本了，直接运行就行。

目前已经有这些脚本：

- `scripts/init.ps1`
- `scripts/add-windows-host.ps1`
- `scripts/list-hosts.ps1`
- `scripts/probe-host.ps1`
- `scripts/exec-remote.ps1`
- `scripts/read-remote-file.ps1`
- `scripts/list-remote-dir.ps1`
- `scripts/write-remote-file.ps1`

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

其中 `exec` 现在还支持先切换到一个经过校验的远程工作目录再执行命令，更适合连续多步操作。

在远程 Windows 上执行命令：

```bash
codex-bridge exec lab-win -- "Get-Process | Select-Object -First 5"
```

先切到远程工作目录再执行命令：

```bash
codex-bridge exec --cwd C:\Temp lab-win -- "Get-ChildItem"
```

读取远程文件：

```bash
codex-bridge read-file lab-win C:\Windows\System32\drivers\etc\hosts
```

查看远程目录：

```bash
codex-bridge list-dir lab-win C:\Users\Public
```

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
