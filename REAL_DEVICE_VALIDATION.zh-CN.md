# 真实设备联调清单

[English Version](./REAL_DEVICE_VALIDATION.md)

这份文档用于真实目标的端到端联调。代码层面“已经支持”不等于项目阶段完成，只有在真实设备上跑过这些检查后，才算真正验收。

## 1. 联调目标

- 验证 Windows + SSH 路径能在真实 Windows 主机上跑通
- 验证 Android + ADB 路径能在真实 Android 设备上跑通
- 验证结构化结果在真实目标上没有漂移
- 验证 `workflow` 至少能闭环一次真实多步流程

## 2. Windows + SSH 联调清单

### 前置条件

- 目标 Windows 已开启 OpenSSH Server
- 当前网络可访问该主机
- 已有一个可登录的 SSH 账号
- 本机已信任该主机的 host key
- 桥中已保存对应的 `windows + ssh` 主机资料

### 必做检查

- `probe`：返回主机名、当前用户、系统信息、PowerShell 信息
- `exec`：简单命令执行成功
- `exec --cwd`：远程工作目录切换生效
- `exec --command-file`：本地脚本文件可发送并执行
- `read-file`：返回文件内容和元数据
- `list-dir`：返回目录项且结构稳定
- `write-file`：写入成功并返回文件元数据
- `search-text`：单文件和目录树两种路径都能工作
- `system-info`：返回结构化机器信息
- `workflow`：验证 `search-text -> read-file -> system-info`
- `workflow`：验证模板变量替换和失败时保留上下文

### 联调后需要记录

- 使用的主机名或别名
- 联调日期
- 执行过的命令
- 实际结果
- 遇到的异常输出或边界情况
- TODO 状态应该改成 `[x]`、保留 `[~]`，还是回退成 `[!]`

## 3. Android + ADB 联调清单

### 前置条件

- 本机已安装 Android platform-tools
- `adb` 已在 `PATH` 中
- `adb devices` 能看到目标 serial
- 设备已开启 USB 调试并授权当前主机
- 桥中已保存对应的 `android + adb` 设备资料

### 必做检查

- `adb devices`：目标 serial 可见且状态已授权
- `probe`：返回机型、设备名、Android 版本、SDK、serial
- `exec`：简单 shell 命令执行成功
- `exec --cwd`：工作目录切换符合预期
- `read-file`：读取一个已知文本文件
- `list-dir`：列出一个已知目录
- `write-file`：写入一个临时文本文件并回读验证
- `search-text`：验证单文件和目录树搜索
- `system-info`：返回 manufacturer、model、SDK、serial、ABI
- `workflow`：验证一个最小 Android 多步流程

### 联调后需要记录

- 使用的设备型号和 serial
- 联调日期
- 连接方式：USB 或无线 ADB
- 执行过的命令
- 实际结果
- 发现的权限限制或 shell 限制
- TODO 状态应该改成 `[x]`、保留 `[~]`，还是回退成 `[!]`

## 4. 最少保留的证据

每一轮真实联调，至少保留这些内容：

- 使用的主机/设备资料
- 每类操作至少一个成功 JSON 结果样本
- 至少一个失败 JSON 结果样本
- 一段简短总结：这轮验证确认了什么、还剩什么风险

## 5. 验收出口条件

只有满足下面这些条件，一条路径才算真正联调完成：

- 上面的必做检查都在真实目标上执行过
- 结果结构对 CLI 和 `workflow` 都是可用的
- 没有未记录的阻塞问题
