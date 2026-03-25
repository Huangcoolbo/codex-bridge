# remote-agent-bridge 中文说明

[English README](./README.md)

`remote-agent-bridge` 是一个用 Python 写的最小可用项目，目标是让本地电脑用统一的方式去连接和操作远程机器。

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

### 1. 初始化本地环境

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

在远程 Windows 上执行命令：

```bash
remote-agent-bridge exec lab-win -- "Get-Process | Select-Object -First 5"
```

读取远程文件：

```bash
remote-agent-bridge read-file lab-win C:\Windows\System32\drivers\etc\hosts
```

查看远程目录：

```bash
remote-agent-bridge list-dir lab-win C:\Users\Public
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
