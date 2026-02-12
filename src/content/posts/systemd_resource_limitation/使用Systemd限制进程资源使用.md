---
title: 最新实践：使用systemd限制进程资源使用
published: 2025-11-09
pinned: false
description: 介绍了如何使用systemd进行进程级的资源限制(基于Cgroups)，以及如何使用systemd-run限制临时进程的资源使用
tags: [Linux性能优化, cgroups]
category: DevOps
draft: false
---

# 参数类型
## CPU 资源限制
| 参数 | 说明 | 示例 |
| --- | --- | --- |
| `CPUQuota=` | 限制 CPU 总占用百分比（相对整个系统） | `CPUQuota=20%`（最多 20% CPU 时间） |
| `CPUQuotaPeriodSec=` | 限制周期，默认 100ms，可配合上面微调调度平滑度 | `CPUQuotaPeriodSec=1s` |
| `CPUShares=` | 设置 CPU 权重（默认 1024），相对优先级 | `CPUShares=512` |
| `CPUWeight=` | cgroup v2 新参数（替代 CPUShares），范围 1–10000 | `CPUWeight=200` |
| `AllowedCPUs=` | 限定可使用的 CPU 核心（cgroup v2） | `AllowedCPUs=0,2,4` 或 `AllowedCPUs=0-3` |
| `Nice=` | 设置进程的 nice 优先级（-20~19） | `Nice=10` |


## 内存限制
| 参数 | 说明 | 示例 |
| --- | --- | --- |
| `MemoryMax=` | 最大可用内存上限 | `MemoryMax=500M` |
| `MemorySwapMax=` | 限制 swap 可用大小 | `MemorySwapMax=0`（禁止 swap） |
| `MemoryHigh=` | 达到此值后触发内核压力控制，但不立刻杀死进程 | `MemoryHigh=400M` |
| `MemoryLow=` | 优先保证该服务的最低内存 | `MemoryLow=200M` |
| `MemoryAccounting=` | 启用内存使用统计（建议总是开） | `MemoryAccounting=true` |


## 磁盘 I/O 相关  
| 参数 | 说明 | 示例 |
| --- | --- | --- |
| `IOWeight=` | 设置 I/O 优先级（范围 1–10000） | `IOWeight=500` |
| `IODeviceWeight=` | 针对具体块设备设置权重 | `IODeviceWeight=/dev/sda 200` |
| `IOReadBandwidthMax=` | 限制读带宽 | `IOReadBandwidthMax=/dev/sda 10M` |
| `IOWriteBandwidthMax=` | 限制写带宽 | `IOWriteBandwidthMax=/dev/sda 5M` |
| `IOReadIOPSMax=` / `IOWriteIOPSMax=` | 限制 IOPS 数量 | `IOWriteIOPSMax=/dev/nvme0n1 200` |


## 网络（需 cgroup v2 + systemd >= 250）  
| 参数 | 说明 | 示例 |
| --- | --- | --- |
| `IPIngressMaxBytes=` | 限制进入流量 | `IPIngressMaxBytes=10M` |
| `IPEgressMaxBytes=` | 限制发出流量 | `IPEgressMaxBytes=5M` |
| `IPAccounting=` | 启用网络流量统计 | `IPAccounting=true` |


## 进程与文件句柄数  
| 参数 | 说明 | 示例 |
| --- | --- | --- |
| `TasksMax=` | 限制该服务下最多可创建多少个线程/进程 | `TasksMax=100` |
| `LimitNOFILE=` | 限制最大文件描述符数 | `LimitNOFILE=4096` |
| `LimitNPROC=` | 限制用户最大进程数 | `LimitNPROC=128` |
| `LimitCORE=` | 限制 core dump 大小 | `LimitCORE=0`（禁用） |


## 自动重启与故障策略（辅助控制）  
| 参数 | 说明 | 示例 |
| --- | --- | --- |
| `Restart=` | 服务崩溃后是否自动重启 | `Restart=on-failure` |
| `RestartSec=` | 重启前等待时间 | `RestartSec=5s` |
| `StartLimitBurst=` / `StartLimitIntervalSec=` | 控制过多重启时的熔断机制 | `StartLimitBurst=3`，`StartLimitIntervalSec=60s` |


# 使用
## 打开 service 文件临时覆盖文件
```bash
systemctl edit ghost
```

## 添加规则
```bash
### Editing /etc/systemd/system/ghost.service.d/override.conf 
### Anything between here and the comment below will become the contents of the drop-in file 
[Service]
CPUQuota=20%

### Edits below this comment will be discarded
```

在空行中增加的规则将被注入到 service 文件中

## 使规则生效
1. 重载配置

```bash
systemctl daemon-reload
```

2. 重新启动应用

```bash
systemctl restart application
```

# 启用统计信息
## 配置变量
```bash
[Service]
CPUAccounting=true
MemoryAccounting=true
IOAccounting=true
IPAccounting=true
```

## 查看
```bash
systemctl status ghost
systemd-cgtop
systemd-cgls
```

# 使用 `systemd-run`
systemd-run 是最新实践，可以将进程以 systemd 临时服务单元的形式启动，cgroups 中的所有资源限制参数都可以通过这条命令进行应用

例如：

```bash
systemd-run --user -p CPUQuota=20% --scope ./hard_script.sh
```

其中：

+ `--user`: 后台运行进程
+ `--scope`: 让该进程在运行时不生成 systemd 临时服务文件
+ `-p`: 指定要控制的资源参数。

