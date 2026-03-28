# 真实设备联调

[English Version](./REAL_DEVICE_VALIDATION.md)

这份文档只回答一件事：项目当前到底在哪些真实目标上跑通过，哪些地方还只是代码层“支持”。

## 1. 先看验收逻辑

```text
代码里已经支持
  !=
真实设备上已经验证

只有跑过真实目标
  ->
保留过结果
  ->
记录过异常与边界
  ->
才能算真正验收
```

## 2. 当前联调目标

```text
Windows + SSH
  -> 验证真实 Windows 主机路径

Android + ADB
  -> 验证真实 Android 设备路径

workflow
  -> 验证多步操作链在真实目标上闭环
```

## 3. Windows + SSH 联调

### 3.1 前置条件

```text
目标 Windows 已开启 OpenSSH Server
   |
   +--> 当前网络可访问
   +--> 已有一个可登录的 SSH 账号
   +--> 本机已信任该主机 host key
   +--> 桥中已保存对应 windows + ssh 配置
```

### 3.2 必做检查

```text
probe
exec
exec --cwd
exec --command-file
read-file
list-dir
write-file
search-text
system-info
workflow
```

### 3.3 每轮联调后必须记录

```text
主机名或别名
联调日期
执行过的命令
实际结果
异常输出或边界情况
TODO 状态应该怎么更新
```

## 4. Android + ADB 联调

### 4.1 前置条件

```text
本机已安装 Android platform-tools
   |
   +--> adb 已可用
   +--> adb devices 能看到目标 serial
   +--> 设备已开启 USB 调试并授权当前主机
   +--> 桥中已保存 android + adb 设备配置
```

### 4.2 必做检查

```text
adb devices
probe
exec
exec --cwd
read-file
list-dir
write-file
search-text
system-info
workflow
```

### 4.3 每轮联调后必须记录

```text
设备型号与 serial
联调日期
连接方式（USB / 无线）
执行过的命令
实际结果
发现的权限或 shell 限制
TODO 状态应该怎么更新
```

## 5. 至少保留哪些证据

```text
使用的主机 / 设备资料
每类操作至少一个成功 JSON 样本
至少一个失败 JSON 样本
一段简短总结
```

总结至少应该说明：

- 这轮确认了什么
- 哪些能力已经稳定
- 还剩什么风险

## 6. 什么才算真正完成

```text
上面列出的必做检查
  全部在真实目标上执行过
     |
     v
结果结构对 CLI 和 workflow 都可用
     |
     v
没有未记录的阻塞问题
```

只有走到这一步，才算“真实联调完成”，而不是“代码里看起来已经支持”。
