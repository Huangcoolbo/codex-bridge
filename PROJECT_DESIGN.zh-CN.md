# codex-bridge 项目设计说明（2026-03）

[English Version](./PROJECT_DESIGN.md)

## 1. 项目定位

`codex-bridge` 不是远程桌面，不是单纯的 SSH/ADB 命令包装器，也不是一个只给人手动点界面的远程管理工具。

它当前的定位可以直接概括成：

```text
User
  |
  v
Codex / Agent
  |
  v
codex-bridge
  |
  +--> 负责选择目标
  +--> 负责发起远程动作
  +--> 负责返回结构化结果
  |
  v
Windows / Android
```

它解决的核心问题不是“怎么连上一台机器”，而是：

> 如何把 Codex 的决策能力，稳定地延伸到远程 Windows 和 Android，并且让这条链路既能给人用，也能给程序用。

---

## 2. 当前系统全景

当前项目已经不是早期的单一 Python CLI 形态，而是一个三层系统：

```text
┌──────────────────────────────────────────────┐
│                 用户 / Codex                  │
└──────────────────────────────────────────────┘
                     │
         ┌───────────┴───────────┐
         │                       │
         v                       v
┌──────────────────┐   ┌──────────────────────┐
│ Electron 桌面客户端 │   │ Local HTTP Gateway     │
│ 给人配置 / 调试 / 看结果 │   │ 给 Codex / agent 调用  │
└──────────────────┘   └──────────────────────┘
         │                       │
         └───────────┬───────────┘
                     v
┌──────────────────────────────────────────────┐
│            Electron Main / Service Layer      │
│  target 管理 / probe / execute / Android API  │
└──────────────────────────────────────────────┘
                     │
      ┌──────────────┴──────────────┐
      │                             │
      v                             v
┌────────────────────┐    ┌─────────────────────┐
│ Python bridge       │    │ Android gateway      │
│ Windows / SSH 主路径 │    │ ADB 受控设备与文件接口 │
└────────────────────┘    └─────────────────────┘
      │                             │
      v                             v
┌───────────────┐          ┌────────────────────┐
│ SSH -> Windows │          │ ADB -> Android      │
│ PowerShell     │          │ shell / file ops    │
└───────────────┘          └────────────────────┘
```

一句话说：

- **桌面客户端**负责给人配置和观察
- **本地 HTTP gateway**负责给 Codex / agent 程序化调用
- **bridge / service**负责把动作送进正确的远程执行路径

---

## 3. 当前代码分层

当前项目最重要的不是文件列表，而是“哪一层负责什么”。

```text
desktop-client/
  ├─ src/renderer/
  │    UI、交互、状态展示、顶部栏动画
  │
  ├─ src/preload/
  │    给 renderer 暴露受控 API
  │
  ├─ src/main/
  │    Electron main
  │    ├─ IPC handlers
  │    ├─ local HTTP gateway
  │    ├─ update service
  │    ├─ tray service
  │    └─ startup bootstrap
  │
  └─ release/
       打包后的安装包 / 发布产物

src/remote_agent_bridge/
  ├─ service.py
  ├─ factory.py
  ├─ adapters/
  │    ├─ ssh.py
  │    └─ adb.py
  └─ providers/
       ├─ windows.py
       └─ android.py

scripts/
  ├─ bootstrap-client-runtime.ps1
  ├─ authorize-managed-ssh-key.ps1
  └─ launch-bridge-client.ps1
```

可以把职责理解成：

```text
renderer   = 你看到和操作的界面
preload    = renderer 和 main 之间的窄桥
main       = 桌面客户端后端
bridge     = 真正跨 SSH / ADB 执行动作的底层
scripts    = 启动、授权、打包后的运行时准备
```

---

## 4. 当前主路径

### 4.1 人类使用路径

```text
用户打开桌面客户端
   |
   v
配置 Windows / Android 目标
   |
   v
点击探测 / 执行 / 读取
   |
   v
Electron Main 接管请求
   |
   v
bridge / service 走 SSH 或 ADB
   |
   v
远程返回 stdout / stderr / exit_code
   |
   v
结果回到 UI
```

### 4.2 Codex / agent 使用路径

```text
Codex / agent
   |
   v
POST /api/targets / /api/probe / /api/command/execute
   |
   v
Local HTTP Gateway
   |
   v
Electron Main services
   |
   v
Python bridge 或 Android gateway
   |
   v
远程目标
```

项目最重要的设计点就是：

```text
同一套底层能力
   ├─ 可以给 UI 用
   └─ 也可以给 HTTP gateway 用
```

所以 UI 不是唯一入口，HTTP gateway 也不是独立重复实现。

---

## 5. 关键设计规则

### 5.1 平台能力和连接方式分离

项目明确不把某条路径写死成：

```text
Windows = SSH = PowerShell
Android = ADB = shell
```

而是拆成：

```text
provider  = 平台语义
adapter   = 连接方式
factory   = 按资料装配两者
```

```text
HostProfile(platform, transport)
            |
            v
         factory
            |
   ┌────────┴────────┐
   v                 v
adapter           provider
```

对应当前实现：

```text
providers/windows.py   -> Windows 平台语义
providers/android.py   -> Android 平台语义
adapters/ssh.py        -> SSH 通道
adapters/adb.py        -> ADB 通道
factory.py             -> 组合它们
```

这意味着后续扩 Linux 时，不需要推翻现有主流程。

### 5.2 UI 和 Gateway 共用同一套能力

项目不希望出现这种情况：

```text
UI 自己一套执行逻辑
Gateway 自己另一套执行逻辑
```

当前更接近：

```text
UI ----------┐
             v
          main services
             |
Gateway -----┘
             |
             v
      bridge / Android gateway
```

这能减少：

- UI 状态和网关状态不一致
- 两套逻辑各自修 bug
- “界面能用，API 不能用”或反过来的问题

---

## 6. 运行时与打包结构

当前项目已经支持开发态和打包态两套运行方式。

### 6.1 开发态

```text
D:\remote-agent-bridge
  ├─ src/
  ├─ desktop-client/
  ├─ scripts/
  └─ data/
```

### 6.2 打包态

```text
安装目录
  └─ Codex.Bridge.exe

用户数据目录
  └─ AppData\Roaming\codex-bridge-desktop-client
       ├─ runtime/
       ├─ data/
       ├─ updates/
       └─ logs / cache
```

打包态的关键点是：

```text
程序文件 ≠ 用户数据
安装目录 ≠ 配置目录
```

这也是为什么升级新版本时，配置通常不会丢。

---

## 7. 启动链路

当前桌面客户端不是“只打开一个壳子”，启动时还会准备本地运行环境。

```text
启动安装版 / exe
   |
   v
Electron main 创建窗口
   |
   v
did-finish-load 之后启动后台服务
   |
   +--> 本地 HTTP gateway
   +--> startup bootstrap
   +--> update check
   +--> tray
```

### 7.1 bootstrap 负责什么

```text
bootstrap-client-runtime.ps1
   |
   +--> 检查 runtime 目录
   +--> 检查 Python 依赖是否完整
   +--> 必要时补装 bridge 依赖
   +--> 检查 localhost 自管 SSH key
   +--> 检查 adb / 环境准备
```

当前已经做过一轮重要修正：

- 不再只看 `.venv` 是否存在
- 而是检查关键依赖是否真的能导入

这避免了“环境只创建了一半但被当成完整”的问题。

---

## 8. Windows 执行链路

当前 Windows 主路径仍然是：

```text
Target
  -> SSH
  -> PowerShell
  -> structured result
```

### 8.1 Windows probe / execute 数据流

```text
renderer / gateway
   |
   v
bridgeService
   |
   v
Python BridgeService
   |
   v
factory -> ssh adapter + windows provider
   |
   v
SSH connect
   |
   v
PowerShell script on remote host
   |
   v
stdout / stderr / exit_code
```

### 8.2 Windows SSH 密钥认证流

当 Windows 目标使用 `SSH + keyPath` 连接时，客户端里配置的不是“远程密钥路径”，而是**本地私钥路径**。

真正的认证关系是：

- 本地保存私钥
- 由私钥推导出公钥
- 把公钥放到远程 Windows 的允许登录白名单里
- SSH 建连时，本地用私钥证明身份，远程用公钥验证

可以把它理解成：

- **本地私钥 = 你手里的钥匙**
- **远程 authorized_keys = 门锁认可的钥匙指纹列表**

```text
┌──────────────────────────────┐
│  Codex.Bridge 客户端本地机器  │
└──────────────────────────────┘
             │
             │ 1. 生成一对密钥
             ▼
   私钥: localhost_ed25519
   公钥: localhost_ed25519.pub

             │
             │ 2. 私钥留在本地
             ▼
   本地配置里保存的是：
   - host
   - port
   - user
   - keyPath -> 指向本地私钥

             │
             │ 3. 公钥复制到远程主机
             ▼

┌──────────────────────────────┐
│      远程 Windows 主机        │
└──────────────────────────────┘
             │
             │ 4. sshd 读取公钥白名单
             ▼

   普通用户常见位置：
   C:\Users\<user>\.ssh\authorized_keys

   管理员账号常见位置：
   C:\ProgramData\ssh\administrators_authorized_keys

             │
             │ 5. 客户端发起 SSH 连接
             ▼

   客户端：
   “我用本地私钥证明我是对应钥匙的持有者”

             │
             │ 6. 远程 sshd 验证
             ▼

   远程主机：
   “我检查这把私钥对应的公钥，
    是否在我的 authorized_keys 白名单里”

             │
      匹配成功 / 匹配失败
             ▼

        成功登录 / 认证失败
```

这个项目里：

```text
keyPath                        -> 本地私钥路径
adapters/ssh.py                -> 读取私钥并连接
authorized_keys                -> 远程公钥白名单
administrators_authorized_keys -> 管理员账号常见白名单
```

---

## 9. Android 执行链路

Android 这条线和 Windows 不完全一样。

当前它分成两部分：

```text
部分旧能力：Python bridge + adb adapter
部分新能力：Electron main Android gateway
```

### 9.1 当前 Android gateway 方向

```text
HTTP / UI
   |
   v
androidGatewayService
   |
   +--> devices / info
   +--> files/list
   +--> files/read
   +--> files/pull
   +--> files/mkdir
   +--> files/write
   +--> files/push
   |
   v
ADB
   |
   v
Android device
```

### 9.2 为什么 Android 写操作要分层

当前项目的策略不是直接开放任意 raw `adb shell`，而是：

```text
只读优先
   |
   v
受控写入
   |
   v
更高风险能力后置
```

目前已经正式产品化的低风险写能力是：

```text
files/mkdir
files/write
files/push
```

这些能力都带限制：

- 白名单目录
- 文本写入模式限制
- 文件大小限制
- 不直接裸开放任意 shell 修改

---

## 10. 当前数据与持久化

项目当前最关键的持久化数据有三类：

```text
1. target / profile
2. runtime / bridge 环境
3. update / release 缓存
```

### 10.1 target 数据

开发态常见：

```text
data/hosts.json
```

打包态常见：

```text
AppData\Roaming\codex-bridge-desktop-client\data\hosts.json
```

### 10.2 运行时目录

```text
AppData\Roaming\codex-bridge-desktop-client\runtime
```

这里放的是打包后 bridge 真正运行所需的：

- Python runtime
- scripts
- src
- `.venv`

### 10.3 更新目录

当前已经改成：

```text
AppData\Roaming\codex-bridge-desktop-client\updates
```

它的职责是：

- 保存新下载的安装包
- 给自动更新流程使用
- 客户端下次启动时清理旧安装包

---

## 11. 当前更新子系统

更新系统已经不是“打开 GitHub 页面看看有没有新版”，而是桌面端自己的正式子系统。

```text
客户端启动
   |
   v
check latest release
   |
   v
发现新版本
   |
   v
下载到 userData/updates
   |
   v
自动启动新安装包
   |
   v
当前客户端退出
   |
   v
安装完成后再次打开
```

它当前的目标不是“无感热更新”，而是：

> 让桌面客户端自己负责检查、下载、交接给安装器，而不是让用户自己去 GitHub 找 exe。

---

## 12. 当前边界与暂不做的事

当前项目已经能做很多事，但边界依然是明确的。

```text
现在做：
  - Windows SSH + PowerShell
  - Android ADB + controlled APIs
  - Electron desktop client
  - local HTTP gateway
  - desktop update flow

现在不做：
  - 远程桌面
  - GUI 自动化
  - 任意高风险 Android raw shell 暴露
  - 远程常驻 agent
  - 公网开放的远程控制服务
```

这套边界是刻意的，不是功能不够，而是为了：

- 先把“可控远程执行网关”站稳
- 避免一开始就变成一个大而杂的平台

---

## 13. 当前阶段最重要的设计判断

如果只保留一句话来描述当前版本的系统设计，那就是：

```text
Codex 负责思考
桌面客户端和本地网关负责组织入口
bridge / gateway 负责发起动作
Windows / Android 负责真正执行
```

这个项目的价值不在于“又多包了一层 SSH/ADB”，而在于：

```text
把原本零散的远程连接、命令执行、文件读写、状态管理、
更新下载和用户配置，收成了一套既能给人用、也能给 agent 用的稳定入口。
```

---

## 14. 协作回复规范（长期约定）

下面这段内容用于约束后续协作中的默认回复方式，属于长期协作规范。

【回复规范开始】
从现在开始，你每次给我回复时，不要只说改了什么，还要顺带用通俗的话补充一小段底层原理说明。

以后你的每次回复，尽量按这个结构来：

1. 这次改了什么
- 直接说改动点和结果

2. 这部分在项目里的位置
- 属于哪一层：UI / renderer / preload / Electron main / HTTP gateway / service / bridge / Python provider / ADB / SSH 等

3. 底层原理
- 这部分是怎么工作的
- 数据怎么流
- 调用链路怎么走
- 为什么这样设计

4. 用了什么技术
- 例如 React、Electron、IPC、HTTP 路由、Node child_process、Python bridge、ADB、SSH、PowerShell 等
- 不要只列名词，要顺手解释这些技术在这里负责什么

5. 对整体架构的影响
- 这是单纯 UI 改动
- 还是把状态从 renderer 挪到了 main
- 还是新增了网关能力
- 还是补了一层 bridge/service

要求：
- 讲人话，不要只堆术语
- 默认把我当成正在熟悉这个项目结构的人
- 每次回复都尽量让我知道这一改动在整个系统里处于什么位置
- 如果涉及新文件，也顺手说这个文件在架构里扮演什么角色
【回复规范结束】
