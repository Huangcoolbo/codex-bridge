# AGENT_GATEWAY

`Codex.Bridge` 的桌面客户端除了提供给人类使用的 UI，还会在本机启动一个给 Codex / agent / 外部开发者调用的本地 HTTP 网关。

这份文档讲的不是界面怎么点，而是：如果把它当成“正式远程执行网关”接入，应该怎样理解和调用。

## 1. 网关定位

这个网关的职责不是替代桌面 UI，而是把同一套底层 bridge/service 能力正式暴露给程序调用方。

```text
Agent / Codex
   |
   v
Local HTTP Gateway
   |
   v
Electron Main Services
   |
   +--> target management
   +--> current session
   +--> probe / execute
   +--> Android device and file APIs
   |
   v
Python bridge / Android gateway
   |
   v
Windows / Android
```

当前支持的范围：

```text
Windows
  -> target 管理
  -> current target
  -> probe
  -> command execute

Android
  -> devices / current device
  -> safe shell
  -> files/list read pull
  -> files/mkdir write push
```

## 2. 启动与地址

默认监听地址：

```text
http://127.0.0.1:8765
```

当前只监听 `127.0.0.1`，不对局域网或公网开放。

### 启动 desktop client

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\launch-bridge-client.ps1
```

或者进入 [desktop-client](./desktop-client) 运行：

```powershell
npm run dev
```

### 确认网关在线

```text
GET /health
   |
   v
success: true
```

示例：

```bash
curl http://127.0.0.1:8765/health
```

## 3. 认证与审计

从现在开始，除了 `GET /health` 之外，其余 gateway 接口都要求本地 token。

支持两种写法：

```text
Authorization: Bearer <token>
X-Codex-Bridge-Token: <token>
```

如果没有显式设置环境变量 `BRIDGE_AGENT_TOKEN`，客户端会在本地自动生成 token 文件。

开发态常见位置：

```text
data/agent-gateway.token
```

打包版常见位置：

```text
%APPDATA%/codex-bridge-desktop-client/data/agent-gateway.token
```

同时，gateway 会把每次请求记到本地审计日志：

开发态常见位置：

```text
data/agent-gateway.audit.log
```

打包版常见位置：

```text
%APPDATA%/codex-bridge-desktop-client/data/agent-gateway.audit.log
```

## 4. Agent 如何自动拿到 token

这里的目标不是让用户手工复制 token，而是让调用方按固定顺序自动解析：

```text
1. 先读环境变量 BRIDGE_AGENT_TOKEN
2. 如果没有，再调用 GET /health
3. 按 health 给出的 bootstrap 策略去应用数据目录读取本地 token 文件
4. 再带着 token 调真正的 /api/* 接口
```

也就是说，推荐的自动化启动顺序不是：

```text
问用户 token 是多少
```

而是：

```text
先看环境变量
再看 health 里给出的 bootstrap 规则
```

`/health` 现在不会把 token 文件绝对路径直接暴露给未认证请求。  
它只会告诉调用方：

- 优先读哪个环境变量
- 如果没有，应该去应用数据目录找本地 token 文件
- 常见位置规则是什么

## 5. 当前接口总览

```text
GET    /health

GET    /api/diagnostics/self-check

GET    /api/targets
GET    /api/targets/:name
POST   /api/targets
PUT    /api/targets/:name
DELETE /api/targets/:name

GET    /api/targets/current
POST   /api/targets/current
DELETE /api/targets/current

POST   /api/probe

POST   /api/command/set
POST   /api/command/run
POST   /api/command/execute
GET    /api/command/last

GET    /api/android/devices
GET    /api/android/devices/:serial/info
GET    /api/android/current
POST   /api/android/current
DELETE /api/android/current

POST   /api/android/devices/:serial/shell/execute
POST   /api/android/devices/:serial/files/list
POST   /api/android/devices/:serial/files/read
POST   /api/android/devices/:serial/files/pull
POST   /api/android/devices/:serial/files/mkdir
POST   /api/android/devices/:serial/files/write
POST   /api/android/devices/:serial/files/push
```

## 6. 接口职责边界

这一节只回答 3 个问题：

- `/health` 和 `/api/diagnostics/self-check` 到底有什么区别
- 哪些接口只检查本地 gateway，自身不碰远程设备
- 哪些接口必须指定目标或设备，才会真正去碰远端

### 6.1 `/health` 只负责轻量健康检查和接入引导

`GET /health` 的职责是：

- 确认 gateway 进程在线
- 返回监听地址
- 说明当前是否要求 token
- 给出 token bootstrap 规则

它回答的是：

```text
gateway 活着没
怎么合法接进来
```

它不负责：

- 检查 Python runtime 是否存在
- 检查 ADB 是否存在
- 判断远程 Windows / Android 环境是否异常
- 判断当前失败更像环境问题还是代码回归

所以 `/health` 是公开的，不要求 token。

### 6.2 `/api/diagnostics/self-check` 只负责本地自检

`GET /api/diagnostics/self-check` 的职责是：

- 检查本地 gateway 依赖是否就绪
- 返回当前鉴权元信息
- 给出本地诊断结论

它当前主要检查：

- 本地 Python runtime
- 本地 ADB

它回答的是：

```text
桥自己有没有准备好干活
本地依赖更像健康、环境异常，还是代码链异常
```

它不直接回答：

- 某台 Windows 主机是否可达
- 某台 Windows 主机的 SSH 是否可用
- 某台 Android 设备是否在线
- 某台 Android 设备当前是否需要重新配对

这些都需要真正带着目标上下文去访问远端，所以 `/api/diagnostics/self-check` 要求 token，但不要求 target 或 device serial。

### 6.3 只检查本地状态、不要求远程目标的接口

这些接口不会主动连接远程设备：

```text
GET    /health
GET    /api/diagnostics/self-check

GET    /api/targets
GET    /api/targets/:name
POST   /api/targets
PUT    /api/targets/:name
DELETE /api/targets/:name

GET    /api/targets/current
POST   /api/targets/current
DELETE /api/targets/current

GET    /api/android/devices
GET    /api/android/current
POST   /api/android/current
DELETE /api/android/current
```

要注意：

- `GET /api/android/devices` 会读取本机 ADB 当前看到的设备列表
- 这不等于“主动去连某台 Android 设备”
- 它更像“看本地桥现在看到了谁”

### 6.4 必须带目标或设备上下文，才会真正碰远端的接口

#### Windows

这些接口会真正走到 Windows SSH 路径：

```text
POST /api/probe
POST /api/command/set
POST /api/command/run
POST /api/command/execute
GET  /api/command/last
```

它们需要：

- 显式传 `target`
- 或者依赖已经设置好的 current target

大白话就是：

```text
不先告诉 gateway 你要操作哪台 Windows 主机
它就没法 probe 或 execute
```

#### Android

这些接口会真正走到 Android ADB 路径：

```text
GET  /api/android/devices/:serial/info
POST /api/android/devices/:serial/shell/execute
POST /api/android/devices/:serial/files/list
POST /api/android/devices/:serial/files/read
POST /api/android/devices/:serial/files/pull
POST /api/android/devices/:serial/files/mkdir
POST /api/android/devices/:serial/files/write
POST /api/android/devices/:serial/files/push
```

它们需要：

- 明确的 `:serial`
- 并且这台设备当前确实在 ADB 可见范围内

也就是说：

```text
这些接口不是“猜一台 Android 设备帮你操作”
而是“你明确指定哪台设备，然后 gateway 再去碰它”
```

### 6.5 远程环境问题应该由谁判断

这一点最容易混。

#### `/api/diagnostics/self-check`

只判断：

- 本地 gateway 是否健康
- 本地依赖是否缺失
- 本地更像环境问题还是代码链异常

#### 远程环境问题

应该由真正连远程目标的接口来判断，例如：

- Windows：
  - `POST /api/probe`
  - `POST /api/command/execute`
- Android：
  - `GET /api/android/devices/:serial/info`
  - `POST /api/android/devices/:serial/files/*`
  - `POST /api/android/devices/:serial/shell/execute`

这些接口失败时，返回中的 `diagnosis` 才更接近：

- SSH 认证失败
- SSH 端口拒绝连接
- DNS 解析失败
- Android 设备 unauthorized
- Android 设备 offline
- Android 路径无效

所以正确的理解顺序是：

```text
/health
  -> gateway 活着没，怎么接入

/api/diagnostics/self-check
  -> gateway 本地依赖是否健康

/api/probe 或真正的 Windows / Android 操作接口
  -> 远程目标是否真的可达、可执行、可读写
```

## 7. 先理解 4 条主路径

### 7.1 Target 管理

```text
POST /api/targets
  -> 写入 data/hosts.json

PUT /api/targets/:name
  -> 更新 data/hosts.json

DELETE /api/targets/:name
  -> 从 data/hosts.json 删除
```

### 7.2 Current Target / Session

```text
GET /api/targets/current
POST /api/targets/current
DELETE /api/targets/current
```

这层是当前会话态，不是主配置表本身。

### 7.3 Windows Probe / Execute

```text
Agent
  -> /api/probe or /api/command/execute
  -> Electron Main
  -> bridgeService / automationService
  -> Python BridgeService
  -> SSH adapter
  -> Windows PowerShell
```

### 7.4 Android Device / Files

```text
Agent
  -> /api/android/...
  -> Electron Main
  -> androidGatewayService
  -> adb
  -> Android device
```

## 8. 返回结构

大部分接口会保持这种统一结构：

```json
{
  "success": true,
  "stdout": "",
  "stderr": "",
  "exit_code": 0,
  "data": {}
}
```

理解方式：

```text
success
  -> 操作是否成功

stdout / stderr
  -> 底层执行返回

exit_code
  -> 底层命令退出码

data
  -> 结构化结果
```

## 9. 最小可用调用序列

### 9.1 健康检查

```bash
curl http://127.0.0.1:8765/health
```

### 9.2 查看已有目标

```bash
curl http://127.0.0.1:8765/api/targets ^
  -H "Authorization: Bearer <token>"
```

### 9.3 设置 current target

```bash
curl -X POST http://127.0.0.1:8765/api/targets/current ^
  -H "Authorization: Bearer <token>" ^
  -H "Content-Type: application/json" ^
  -d "{\"target\":\"localhost\"}"
```

### 9.4 直接执行一条命令

```bash
curl -X POST http://127.0.0.1:8765/api/command/execute ^
  -H "Authorization: Bearer <token>" ^
  -H "Content-Type: application/json" ^
  -d "{\"target\":\"localhost\",\"shell\":\"powershell\",\"command\":\"Get-Date\"}"
```

## 10. 常见调用模板

这一节不再讲抽象接口，而是直接给最常见的调用模板。

### 10.1 新建一个 Windows target

```bash
curl -X POST http://127.0.0.1:8765/api/targets ^
  -H "Authorization: Bearer <token>" ^
  -H "Content-Type: application/json" ^
  -d "{\"name\":\"lab-win\",\"platform\":\"windows\",\"host\":\"192.168.1.50\",\"port\":22,\"user\":\"admin\",\"auth_type\":\"key\",\"key_path\":\"D:\\\\remote-agent-bridge\\\\data\\\\ssh\\\\localhost_ed25519\",\"note\":\"lab machine\"}"
```

调用链路：

```text
POST /api/targets
  -> Electron Main
  -> bridgeService
  -> data/hosts.json
```

### 10.2 设置当前 target

```bash
curl -X POST http://127.0.0.1:8765/api/targets/current ^
  -H "Authorization: Bearer <token>" ^
  -H "Content-Type: application/json" ^
  -d "{\"target\":\"lab-win\"}"
```

### 10.3 探测一个 Windows target

```bash
curl -X POST http://127.0.0.1:8765/api/probe ^
  -H "Content-Type: application/json" ^
  -d "{\"target\":\"lab-win\"}"
```

成功返回大致会像这样：

```json
{
  "success": true,
  "stdout": "",
  "stderr": "",
  "exit_code": 0,
  "data": {
    "target": "lab-win"
  }
}
```

### 10.4 执行 PowerShell

```bash
curl -X POST http://127.0.0.1:8765/api/command/execute ^
  -H "Content-Type: application/json" ^
  -d "{\"target\":\"lab-win\",\"shell\":\"powershell\",\"command\":\"Get-Process | Select-Object -First 5\"}"
```

返回核心看这几项：

```text
success
stdout
stderr
exit_code
```

### 10.5 列出 Android 设备

```bash
curl http://127.0.0.1:8765/api/android/devices
```

### 10.6 读取 Android 设备信息

```bash
curl http://127.0.0.1:8765/api/android/devices/608e7d4d/info
```

### 10.7 列出 Android 目录

```bash
curl -X POST http://127.0.0.1:8765/api/android/devices/608e7d4d/files/list ^
  -H "Content-Type: application/json" ^
  -d "{\"path\":\"/sdcard/Documents\"}"
```

### 10.8 在 Android 上创建目录

```bash
curl -X POST http://127.0.0.1:8765/api/android/devices/608e7d4d/files/mkdir ^
  -H "Content-Type: application/json" ^
  -d "{\"path\":\"/sdcard/Documents/codex-gateway-workspace\",\"recursive\":true}"
```

### 10.9 在 Android 上写文本文件

```bash
curl -X POST http://127.0.0.1:8765/api/android/devices/608e7d4d/files/write ^
  -H "Content-Type: application/json" ^
  -d "{\"path\":\"/sdcard/Documents/codex-gateway-workspace/test.txt\",\"content\":\"hello from gateway\",\"mode\":\"overwrite\",\"create_if_missing\":true,\"encoding\":\"utf-8\"}"
```

### 10.10 一个完整的典型顺序

```text
先建 target
  -> 设置 current target
  -> probe
  -> execute

或者：

列 Android 设备
  -> 选 serial
  -> info
  -> files/list
  -> files/read / files/write
```

## 11. Android 当前开放边界

当前 Android gateway 只开放了只读接口和第一批受控写接口；写操作能力不是 ADB 本身不能做，而是当前版本只把低风险路径产品化暴露出来。

### 11.1 当前已开放

```text
只读
  -> devices
  -> info
  -> shell/execute (safe mode)
  -> files/list
  -> files/read
  -> files/pull

低风险受控写
  -> files/mkdir
  -> files/write
  -> files/push
```

### 11.2 当前未正式开放

```text
files/delete
files/move
settings write
input tap
input text
install apk
任意 raw adb shell
```

## 12. Android 写接口的当前限制

### `files/mkdir`

```text
只允许白名单目录
  -> /sdcard/Download
  -> /sdcard/Documents
  -> /sdcard/Android/media/com.codexbridge.gateway
```

### `files/write`

```text
只允许白名单目录
只支持文本写入
默认 utf-8
只支持 overwrite / append
不支持随机偏移写入
单次大小受限
父目录不存在时不会偷偷无限级创建
```

### `files/push`

```text
只允许白名单目录
本地文件必须存在
远端父目录必须存在
默认 overwrite=false
```

## 13. 字段映射

HTTP body 和内部配置字段存在映射关系：

```text
host           <-> hostname
user           <-> username
auth_type      <-> authMethod
key_path       <-> keyPath
note           <-> description
store_password <-> storePassword
```

## 14. 安全边界

### 14.1 passwordOverride

```text
只用于一次性 probe / execute
不持久化
```

### 14.2 password

```text
只有在密码认证
且 storePassword=true
时才持久化
```

### 10.3 keyPath

```text
允许持久化
Windows 默认优先项目自管 key
```

默认 Windows 项目自管 key 路径规则是：

```text
data/ssh/localhost_ed25519
```

开发版和打包版的绝对路径会不同，但相对规则保持一致。

## 12. 持久化规则

```text
POST /api/targets
PUT  /api/targets/:name
DELETE /api/targets/:name
  -> 写回 data/hosts.json

current target / current android device
  -> 会话态，不等于 hosts.json 主配置表

last result
  -> 进程内最近一次结果缓存
```

## 13. 错误处理约定

常见失败大致分成这些层：

```text
target 不存在
  -> 名称不对或配置未保存

参数不合法
  -> body 缺字段或字段越界

认证失败
  -> 密码 / key / authorized_keys 不匹配

连接失败
  -> SSH / ADB 根本没连上

执行失败
  -> 远端命令执行返回错误
```

## 14. 调用时先读什么

```text
如果你只是想调起来
  -> docs/GETTING_STARTED.zh-CN.md

如果你要看整个系统为什么这样分层
  -> PROJECT_DESIGN.zh-CN.md

如果你要继续开发
  -> docs/DEVELOPMENT.zh-CN.md
```
