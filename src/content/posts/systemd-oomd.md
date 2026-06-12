---
title: systemd-oomd 在 cgroup v2 下的触发机制与服务级 OOM 控制实践
published: 2026-02-09
pinned: true
description: 本文深入解析 systemd-oomd 的工作原理，说明其如何基于 PSI 与 cgroup v2 监控内存压力，并与传统内核 OOM 机制进行对比。通过 memory.high、slice 配置与服务示例，演示如何在生产环境中实现更精细的 OOM 控制。
tags: [Linux Kernel, cgroups, 内存管理, systemd]
category: Linux
draft: false
---

在 cgroup v2 成为主流之后，传统的内核 OOM Killer 已经不再是唯一的内存回收机制。systemd 引入的 systemd-oomd 通过 ``PSI``（Pressure Stall Information）感知系统内存压力，在内核 OOM 触发前主动终止高风险服务，从而避免整机卡死。

本文将从 PSI 指标含义入手，分析 systemd-oomd 的三种触发场景，并结合 ``memory.high``、``slice`` 配置与实际示例，说明它与内核 OOM 的区别以及在生产环境中的应用方式。

# PSI（Pressure Stall Information）
PSI (Pressure Stall Information) 是 Linux 内核（4.20+）提供的一项高级功能，用于实时监控 CPU、内存和 IO 资源的压力情况。它量化了任务因等待硬件资源而停顿的时间，能准确反映资源紧张对系统性能的影响，帮助预测系统崩溃并优化资源利用率。

## 被监控的四种资源
+ cpu
+ io
+ irq
+ memory

##  PSI 输出结构  
```bash
some avg10=12.50 avg60=8.23 avg300=5.01
full avg10=2.30 avg60=1.10 avg300=0.50
```

###  some 和 full 的区别  
+ some -  至少有一个任务因为内存压力而被阻塞  
+ full -  所有非 idle 任务都在等待资源  

### avg
avg 表示时间跨度，是“在过去的一段时间内”的意思，比如 avg10 就是在过去 10s 内的意思。因此，结合起来，`some avg10=12.50`  这段输出可以理解为 在过去 10 秒里，有 12.5% 的时间至少有一个任务因为内存问题被卡住。也就是说，在这 10 秒中，有 `10 秒 × 12.5% = 1.25 秒`处于有进程被卡住的状态。

## PSI 目录
+ `/proc/pressure/cpu`
+ `/proc/pressure/memory`
+ `/proc/pressure/io`
+ `/proc/pressure/irq`

#  systemd-oomd 的触发条件  
 它主要根据三种情况杀进程

##  memory.high 持续超标 + PSI 高  
如果某个 cgroup：

+ `memory.high` (cgroups 内存软性限制，超过只会被限制和回收资源，不会直接触发 OOM) 被持续超过
+ PSI memory pressure 高
+ 持续一段时间

它就会选一个进程杀（依据 cgroups `oom_score_adj` 和实时计算的`oom_score`）

##  swap 用尽  
包括

+  swap 使用率过高  
+  系统接近`swap exhaustion`

此时会优先杀大内存进程

##  全局内存压力严重  
 如果整机 memory pressure 很高，包括 `PSI full`超过阈值且 持续一定时间，会随机杀死 某个 service  来尝试解决内存压力。

## 服务使用的内存超过 memory.max 的情况
当服务所在 cgroup 的 `memory.max` 被突破时，触发 OOM 的是内核（kernel），不是 systemd-oomd。

这是故意的设计，因为`memory.max`是内存硬限制， 必须由内核立即处理，一旦`alloc_pages()`失败，即刻触发。

# systemd-oomd 与内核 OOM 的区别
| 对比 | 内核 OOM | systemd-oomd |
| --- | --- | --- |
| 运行位置 | 内核态 | 用户态 |
| 触发时机 | 内存耗尽 | 内存压力高 |
| 依据 | oom_score | PSI + cgroup |
| 精细度 | 较粗 | 按 service 粒度 |
| 可控性 | 低 | 高 |


# systemd-oomd 配置文件
+ 主配置文件：`/etc/systemd/oomd.conf`
+  默认模板：`/usr/lib/systemd/oomd.conf`
+  查看当前生效配置：`systemd-analyze cat-config systemd/oomd.conf`

## [OOM] SECTION OPTIONS
1. `DefaultMemoryPressureLimit`

当某个受管控的 cgroup 的 memory PSI 超过 指定的百分比时（比如 60%） 时，进入候选杀名单。这个百分比针对的是`PSI some avg10`，而不是内存使用率或 free memory 的百分比。

2. `DefaultMemoryPressureDurationSec`

memory pressure 超过阈值持续一定时长才触发（比如 30s），这是一个抗抖动的机制，通过设定一定的冗余时间，允许进程偶尔超过设定的标准而不被杀死。

3. `SwapUsedLimit`

 如果 swap 使用率超过 指定的百分比（比如 90%），则可以触发 kill。  

4. 典型 systemd-oomd 配置

```properties
[OOM]
DefaultMemoryPressureLimit=60%
DefaultMemoryPressureDurationSec=30s
SwapUsedLimit=90%
```

## 如何让指定的服务启动 systemd-oomd
需要修改服务的 service 文件，增加两个参数：

+ ManagedOOMMemoryPressure
+ ManagedOOMSwap

都有三种可选值：

| 值 | 含义 |
| --- | --- |
| auto | 默认行为 |
| kill | 允许被 oomd 杀 |
| none | 禁止被 oomd 杀 |


比如：

```properties
[Service]
ManagedOOMMemoryPressure=kill
ManagedOOMSwap=kill
```

###  和 memory.high 的关系
systemd-oomd 只会重点关注设置了 `memory.high` 的 cgroup或 memory pressure 显著的 cgroup；因此如果一个服务没有设置 `memory.high`，PSI 符合配置文件的定义时，仍可能触发 systemd-oomd，但优先级通常低一些。

## 为整个 slice 启用配置
例如，要为所有 `user.slice` 下的服务启用配置

1. 创建 drop-in 目录：`/etc/systemd/system/user.slice.d/`
2. 创建配置文件：`/etc/systemd/system/user.slice.d/oom.conf`，写入配置，例如

```properties
[Slice]
ManagedOOMMemoryPressure=kill
```

3. 重载 systemd 配置 `systemctl daemon-reload`
4. 确认配置：`systemctl show user.slice`

## 创建独立的 slice 并将服务纳入该 slice 以实现资源组控制
以创建一个 web slice，并为该 slice 下的 nginx 和 node 服务统一设置内存和 cpu 限制

### 创建 web.slice
1. 创建配置文件：`/etc/systemd/system/web.slice`
2. 写入配置

```properties
[Unit]
Description=Web Services Slice

[Slice]
CPUAccounting=yes
MemoryAccounting=yes
MemoryHigh=2G
CPUQuota=100%
ManagedOOMMemoryPressure=kill
```

其中`CPUAccounting` 和 `MemoryAccounting` 是用来启用资源限制的参数，同时也为 `systemd-cgtop` 提供了根据 cgroups slice 分组的资源可视化

``ManagedOOMMemoryPressure``配置为 ``kill``，这意味着当 slice 组的资源使用量之和超过声明的量时，systemd-oomd 会生效，从占用资源最多的进程开始杀。

3. 生效配置：`systemctl daemon-reload`

###  让 nginx.service 使用 web.slice (使用 drop-in 方式)
1. 创建 drop-in 目录：`/etc/systemd/system/nginx.service.d/`
2. 创建配置文件：`/etc/systemd/system/nginx.service.d/slice.conf`
3. 在配置文件中声明 nginx 服务所归属的 slice

```properties
[Service]
Slice=web.slice
```

4. 应用配置

### 创建 node 应用并配置 slice（在主服务文件中显式声明）
1. node app 代码

```javascript
const http = require('http');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Hello World\n');
});

server.listen(8000, () => {
  console.log('Server running at http://localhost:8000/');
});
```

2. 创建 service 服务文件

```properties
[Unit]
Description=Node.js App on Port 8000
After=network.target

[Service]
Slice=web.slice # 在这里显式声明所属的slice
Type=simple
User=root
WorkingDirectory=/opt/node-app
ExecStart=/root/.nvm/versions/node/v20.19.0/bin/node /opt/node-app/app.js
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
Environment=NODE_ENV=testing

[Install]
WantedBy=multi-user.target
```

3. 运行服务

### 验证
1. 使用 `systemd-cgls`命令

```latex
[root@exp-bridge system]# systemd-cgls -u web.slice  # 直接查看 slice 的完整内容
Unit web.slice (/web.slice):
├─nginx.service
│ ├─1750 nginx: master process /usr/sbin/nginx
│ ├─1751 nginx: worker process
│ ├─1752 nginx: worker process
│ ├─1753 nginx: worker process
│ └─1754 nginx: worker process
└─node-app.service
  └─3103 /root/.nvm/versions/node/v20.19.0/bin/node /opt/node-app/app.js
```

2. 使用 systemd-cgtop 查看 slice 的资源利用率

```latex
CGroup                                                                  Tasks   %CPU   Memory  Input/s Output/s
/web.slice                                                                 12      -    12.8M        -        -
/web.slice/nginx.service                                                    5      -     5.8M        -        -
/web.slice/node-app.service                                                 7      -     6.9M        -        -
```

