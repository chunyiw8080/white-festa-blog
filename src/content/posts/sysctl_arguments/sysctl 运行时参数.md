---
title: sysctl运行时参数及面向场景的调优策略
published: 2025-01-11
pinned: false
description: 介绍了Linux中常用的sysctl运行时参数，涵盖了内存、网络、IO与文件系统及进程与安全相关；面向特定场景介绍了具体的优化措施
tags: [Linux调优]
category: Linux
draft: false
---

# 主要参数类别
| 前缀 | 全称 | 主要控制内容 | 示例参数 | 影响性能的方面 |
| --- | --- | --- | --- | --- |
| **vm** | Virtual Memory | 内存与交换区管理 | `vm.swappiness`, `vm.dirty_ratio` | 内存调度、缓存回写、swap 行为 |
| **net** | Networking | 网络协议栈 | `net.ipv4.tcp_fin_timeout`, `net.core.somaxconn` | TCP/IP 性能、连接队列、缓冲区 |
| **fs** | Filesystem | 文件系统与 VFS 层 | `fs.file-max`, `fs.nr_open` | 文件句柄限制、IO 性能 |
| **kernel** | Kernel Core | 核心参数、进程与调度 | `kernel.pid_max`, `kernel.threads-max` | 进程数、调度、内核行为 |
| **user** | User Limits | 用户级限制 | `user.max_user_namespaces` | 容器化与命名空间 |
| **dev** | Devices | 设备接口（块设备、tty 等） | `dev.cdrom.autoclose` | IO 与设备行为 |
| **debug** | Debugging | 内核调试参数 | `debug.exception-trace` | 内核日志、调试信息输出 |
| **abi** | Application Binary Interface | 系统调用兼容性 | `abi.vsyscall32` | 兼容性和系统调用行为 |
| **crypto** | Cryptography | 内核加密框架 | `crypto.fips_enabled` | 加密、FIPS 模式 |
| **sunrpc** | SunRPC/NFS | NFS 和 RPC 网络文件系统 | `sunrpc.tcp_slot_table_entries` | NFS 性能与连接 |
| **netfilter** | Netfilter/iptables | 防火墙与包过滤 | `net.netfilter.nf_conntrack_max` | 网络连接跟踪性能 |
| **bus** | Bus subsystem | 硬件总线参数（PCI、USB 等） | `bus.usb.autosuspend` | 外设功耗与性能 |
| **vm.hugetlb** | HugeTLB subsystem | 大页内存管理 | `vm.hugetlb_shm_group` | 高性能内存映射 |
| **fs.aio-max-nr** | Async I/O | 异步 I/O 限制 | `fs.aio-max-nr` | 高并发 IO 性能 |


# 常用参数
## 内存（vm.*）  
| 参数 | 作用 | 常用取值 | 说明 |
| --- | --- | --- | --- |
| **vm.swappiness** | 控制系统使用 swap 的倾向 | 0~100（默认60） | 值越大越倾向使用 swap；服务器常调小，如 `10` 或 `1` |
| **vm.dirty_ratio** | 系统允许的最大脏页比例 | 默认20 | 达到比例后开始写回到磁盘，此时写操作会被阻塞 |
| **vm.dirty_background_ratio** | 到达该比例后台线程开始回写 | 默认10 | 达到比例后开始写回到磁盘，但不阻塞写操作（如果脏页增加速度远大于该值，那么当该值等于**dirty_ratio，**依然会触发写阻塞） |
| **vm.dirty_writeback_centisecs** | 内核刷盘线程的唤醒频率，每次唤醒时刷盘线程会检查是否有脏页堆积并需要写回到磁盘 | 默认 500，即 5 秒 | 减小：数据安全要求高、写密集型、容器和虚拟化环境、慢速存储设备 - 频繁写回减少数据丢失概率，提高多租户环境的数据一致性。<br/>增大：高性能计算和批处理 - 合并写操作降低磁盘 IO、临时数据处理、UPS 断电保护环境、SSD 优化 - 本身随机写入性能好，降低刷盘频率提升 SSD 寿命 |
| **vm.dirty_expire_centisecs** | 脏页在内存中允许停留的最大时间，超过该值，刷盘线程会在下一次唤醒时将其写回磁盘 | 默认 3000，即 30 秒 | |
| **vm.overcommit_memory** | 控制内存分配策略 | 0=启发式, 1=允许超分配, 2=严格检查 | 数据库场景多用 `1` |
| **vm.overcommit_ratio** | 当 overcommit_memory=2 时的分配阈值 | 默认50 | 占总内存的百分比 |
| **vm.drop_caches** | 手动清理缓存 | 写入1,2,3触发 | 一般用于测试，不建议常用 |
| **vm.min_free_kbytes** | 系统预留的最小空闲内存 | 默认自动计算 | 低内存系统可调高避免OOM |
| **vm.nr_hugepages** | 预分配的大页(2MB) 数量 | 整数，如 1024，则预留内存为 1024*2MB | 对数据库或大内存应用有帮助 |


### vm.overcommit_memory 
该参数控制的不是实际可用的内存，而是应用在运行前申请的内存大小。如果设置为1，则可以申请到比物理内存加交换内存总和还大的内存空间，但运行时有可能因实际可以内存不足而OOM；而如果设置为0，则在当申请的内存空间大于当前可用的内存空间时，会直接请求失败。  

三种模式

+ 0 — Heuristic overcommit（默认）
    - 内核使用启发式算法判断是否允许分配内存。
    - 不严格，也不完全自由。
    - 基本原则：申请阶段尽量不超过（物理 + swap）的大约一定比例。
+  1 — Always overcommit  
    - 分配阶段永远不会拒绝 malloc 请求。
    - 可以申请到巨大内存（如 100GB），即使实际只有 2GB。
    - 运行时写入时才会真正分配物理页。
    - 一旦真实内存不足 → OOM Killer 出手。
+ 2 — Strict overcommit
    -  使用严格公式判断申请是否允许：`CommitLimit = Swap + (RAM * overcommit_ratio / 100)`
    -  申请阶段必须小于 `CommitLimit`，否则直接失败（ENOMEM）  
    - 常用情景：**数据库服务器**、**高性能计算（HPC）集群 / 科研计算节点**、**零容忍 OOM 的实时/关键系统**，共同点是需要确保关键服务不会因为内存超载而被 OOM，与其在运行中因内存超载爆掉，不如一开始就在内存申请阶段失败，这样对主系统/应用更安全

### **vm.overcommit_ratio**
该参数只在 **vm.overcommit_memory=2（严格模式）** 时生效，用来控制允许应用在“申请阶段”能分配的最大虚拟内存额度。  

### HugePages（vm.nr_hugepages） vs Transparent HugePages（THP）
| 特性 | HugePages（HugeTLB，大页） | THP（透明大页） |
| --- | --- | --- |
| 本质 | **静态预留大页， 系统启动后就从物理内存中直接划分出去  ** | **动态自动合并大页** |
| 启用方式 | 手动配置 `vm.nr_hugepages` | 自动，只要 THP 打开 |
| 何时分配 | **开机后即从物理内存预留** | 进程运行中内核根据需要合并 4KB 页 |
| 是否可用作普通内存 | 不可以，被固定保留 | 可以 |
| 是否可 swap | 不能 swap | 可能 swap（取决于内核版本） |
| 是否可回收 | 不可 | 可在压力下拆分回 4KB |
| 是否需要应用配合 | 需要应用程序显式申请大页 | 完全透明（ 进程在不知道的情况下就得到大页  **）** |
| 性能 | 高，稳定，无碎片影响 | 中，受内存碎片化影响 (内存碎片化程度高时会拆分会小页） |


#### Transparent HugePages 配置
+  transparent_hugepage.enabled -  决定 是否使用透明大页 以及 使用策略 ，常见值有：**  **
    - always -  尽可能使用 THP，只要能分配到 2MB 大页就使用。如果没有连续大块内存，内核 _可能会触发同步 defrag_ 来整理内存。最激进、最容易导致性能抖动。  
    - madvise -  默认不使用 THP，只有进程使用 `madvise(MADV_HUGEPAGE)` 明确请求时才用。这是 性能最可控 的方式。  
    - never - 完全禁用 THP，不透明合并，不使用大页。传统数据库通常推荐此项。
+ transparent_hugepage.defrag -  决定 为了分配透明大页，内核是否愿意整理（compaction）内存； 整理内存是昂贵的，会引发暂停（latency spike），所以这个参数非常重要。  
    -  always -  为了分配 THP，内核会做同步的 memory compaction → 可能卡顿  
    -  madvise -  只有进程显式请求 THP（MADV_HUGEPAGE）时，才会进行内存整理  
    -  defer -  尝试分配 THP，但如果没有连续内存则 _不阻塞_，推迟到后台异步整理。  
    -  defer+madvise -  与 defer 类似，但只对 madvise 的进程做整理，最平衡。  
    -  never -  不会为了分配 THP 整理内存。若内存不可连续则直接使用 4KB 小页。

#### 修改Transparent HugePages 配置
1. 通过 systemd 服务文件配置
    1. 创建服务`/etc/systemd/system/disable-thp.service`
    2. 写入内容

```bash
[Unit]
Description=Disable Transparent Huge Pages
After=sysinit.target local-fs.target

[Service]
Type=oneshot
ExecStart=/bin/sh -c "echo never > /sys/kernel/mm/transparent_hugepage/enabled"
ExecStart=/bin/sh -c "echo never > /sys/kernel/mm/transparent_hugepage/defrag"

[Install]
WantedBy=multi-user.target
```

2. 通过内核启动参数关闭 THP
    1. 修改 `/etc/default/grub`，加入一行`GRUB_CMDLINE_LINUX="transparent_hugepage=never"`
    2. 重新生成 grub 配置
        1.  Ubuntu/Debian:  `update-grub`
        2.  CentOS/RHEL:  `grub2-mkconfig -o /boot/grub2/grub.cfg`
3. 临时修改

```bash
echo never > /sys/kernel/mm/transparent_hugepage/enabled
echo never > /sys/kernel/mm/transparent_hugepage/defrag
```



##  网络（net.*）  
### 通用网络参数
| 参数 | 作用 | 常用取值 | 说明 |
| --- | --- | --- | --- |
| **net.ipv4.ip_forward** | 是否允许路由转发 | 0/1 | 网关或容器网络中需开启 |
| **net.ipv4.conf.all.rp_filter** | 反向路径过滤 | 0/1/2 | 某些多网卡主机建议关闭 |
| **net.ipv4.icmp_echo_ignore_all** | 忽略所有 ping 请求 | 0/1 | 安全要求高时可设为1 |
| **net.ipv4.tcp_syncookies** | SYN 洪水防御 | 0/1 | 建议开启（默认开启） |


###  TCP 优化  
| 参数 | 作用 | 常用取值 | 说明 |
| --- | --- | --- | --- |
| **net.ipv4.tcp_fin_timeout** | FIN_WAIT2 超时时间 | 默认60 | 可适当调小如 `15` |
| **net.ipv4.tcp_keepalive_time** | Keepalive 发包间隔 | 默认7200秒 | 长连接可适当调小 |
| **net.ipv4.tcp_tw_reuse** | 允许 TIME_WAIT socket 复用 | 0/1 | Web服务器常开启 |
| **net.ipv4.tcp_max_syn_backlog** | 半连接队列长度 | 默认128 | 高频并发系统调大，如 `4096` |
| **net.core.somaxconn** | listen 队列最大值 | 默认128 | Web服务器建议 `1024+` |
| **net.core.netdev_max_backlog** | 接收队列最大值 | 默认1000 | 网络密集型系统可调至 `5000~10000` |


## I/O 与文件系统（fs.*）  
| 参数 | 作用 | 常用取值 | 说明 |
| --- | --- | --- | --- |
| **fs.file-max** | 系统最大打开文件数 | 整数 | 默认较小，生产环境可调大 |
| **fs.nr_open** | 每进程最大文件描述符 | 整数 | 通常配合 ulimit 调整 |
| **fs.aio-max-nr** | 最大 AIO 请求数 | 默认65536 | I/O 密集型程序可调大 |
| **fs.inotify.max_user_watches** | 单用户最大 inotify 监听数 | 默认8192 | 常用于监控、同步程序（如 inotifywait） |


## 进程与安全（kernel.*）  
| 参数 | 作用 | 常用取值 | 说明 |
| --- | --- | --- | --- |
| **kernel.pid_max** | 最大进程号 | 默认32768 | 高并发系统可调至 4194304 |
| **kernel.threads-max** | 最大线程数 | 整数 | 控制系统并发上限 |
| **kernel.msgmnb / msgmax / msgmni** | 消息队列相关 | 各种整数值 | IPC 调整时常用 |
| **kernel.shmall / shmmax** | 共享内存段总量与单段大小 | 字节数 | 数据库常调大 |
| **kernel.sched_migration_cost_ns** | 调度迁移延迟 | 纳秒值 | 调度优化时可微调 |


# 使用
## 查看参数
```bash
sysctl vm.swappiness
```

## 修改参数
```bash
# 临时修改（立即生效，重启失效）
sysctl -w vm.swappiness=10

# 永久修改（写入配置文件）
echo "vm.swappiness=10" >> /etc/sysctl.conf
sysctl -p  # 重新加载
```

# 常见组合参数
##  数据库服务器（MySQL、PostgreSQL、Oracle）  
### 调优目标：
+ 稳定性优先
+ 减少 Swap、保证 I/O 连续性
+ 支持大页内存与共享内存段

###  常用参数组合 
| 参数 | 推荐值 | 说明 |
| --- | --- | --- |
| `vm.swappiness` | 1~10 | 尽量不使用 swap |
| `vm.overcommit_memory` | 1 | 允许一定内存超分配 |
| `vm.dirty_ratio` | 10 | 减少脏页堆积 |
| `vm.dirty_background_ratio` | 5 | 更早触发后台写回 |
| `vm.nr_hugepages` | 若干（根据DB内存） | 启用大页（HugePage）减少TLB miss |
| `kernel.shmmax` | 总内存的 50%~80% | 允许数据库大共享内存段 |
| `kernel.shmall` | 与上匹配 | 系统可用共享内存总量 |
| `fs.file-max` | ≥1000000 | 增加文件句柄数 |
| `fs.aio-max-nr` | 1048576 | 支持更多异步I/O请求 |
| `net.core.somaxconn` | 1024+ | 增加连接排队队列 |
| `net.ipv4.tcp_fin_timeout` | 15 | 减少TIME_WAIT积压 |


另外，MySQL 数据库部署的系统上建议关闭 透明大页（THP），有助于小文件随机读写性能

```bash
echo never > /sys/kernel/mm/transparent_hugepage/enabled
```

##  高并发 Web / API 服务器（Nginx、Node.js、Gunicorn 等） 
### 调优目标：
+ 提升连接承载量
+ 降低 `TIME_WAIT` 影响
+ 增大队列和缓冲区

###  常用参数组合
| 参数 | 推荐值 | 说明 |
| --- | --- | --- |
| `net.core.somaxconn` | 1024~65535 | listen() 队列上限 |
| `net.ipv4.tcp_max_syn_backlog` | 4096+ | 半连接队列上限 |
| `net.ipv4.tcp_tw_reuse` | 1 | 复用 TIME_WAIT 连接 |
| `net.ipv4.tcp_fin_timeout` | 15 | 提高连接回收速度 |
| `net.ipv4.ip_local_port_range` | 1024 65535 | 扩大本地端口范围 |
| `net.core.netdev_max_backlog` | 10000 | NIC 接收队列上限 |
| `fs.file-max` | 1048576 | 提高系统文件句柄 |
| `net.ipv4.tcp_sack` | 1 | 启用 SACK 提高传输效率 |


+ Web 服务高峰期常出现 `TIME_WAIT` 激增，可通过 `tcp_tw_reuse=1` 缓解。
+ 配合 **ulimit -n** 调整进程级文件描述符限制。

##  文件存储 / NFS / 对象存储服务器  
### 调优目标：
+ 提高磁盘缓存写入效率
+ 减少脏页滞留
+ 增加 I/O 并行度

### 常用参数组合
| 参数 | 推荐值 | 说明 |
| --- | --- | --- |
| `vm.dirty_ratio` | 15 | 系统允许的最大脏页比例 |
| `vm.dirty_background_ratio` | 5 | 后台写回比例 |
| `vm.vfs_cache_pressure` | 50 | 保留更多 inode/dentry 缓存 |
| `fs.aio-max-nr` | 1048576 | 异步I/O上限 |
| `vm.laptop_mode` | 0 | 服务器上应禁用节能延迟写入 |
| `vm.swappiness` | 5 | 降低 Swap 使用 |
| `fs.file-max` | 500000+ | 提高文件句柄数 |


+ 如果是大量小文件读写，可以考虑关闭 THP。
+ 对 SSD 或 NVMe 存储，I/O 调度器推荐使用 `none` 或 `mq-deadline`。

##  容器宿主机（Kubernetes / Docker / Podman）  
### 调优目标：
+ 提高 cgroup 调度效率
+ 限制资源滥用
+ 提升网络与进程数量上限

###  常用参数组合
| 参数 | 推荐值 | 说明 |
| --- | --- | --- |
| `vm.overcommit_memory` | 1 | 容器内进程灵活分配内存 |
| `kernel.pid_max` | 4194304 | 提高 PID 上限 |
| `kernel.threads-max` | 2097152 | 提高线程数 |
| `net.ipv4.ip_forward` | 1 | 启用容器网络转发 |
| `net.bridge.bridge-nf-call-iptables` | 1 | 启用容器网络规则 |
| `fs.inotify.max_user_instances` | 512 | 提高容器内监控上限 |
| `fs.inotify.max_user_watches` | 1048576 | 常用于 k8s + inotify 场景 |
| `net.netfilter.nf_conntrack_max` | 1048576 | 设置连接跟踪表的最大条目数 |
| `net.ipv4.netfilter.ip_conntrack_max` | 1048576 | 旧版内核的连接跟踪参数，与上面功能相同 |
| `net.core.somaxconn` | 65535 | 设置每个端口监听队列的最大长度 |
| `net.ipv4.tcp_max_syn_backlog` | 65535 | TCP半连接队列（SYN队列）的最大长度 |
| `net.core.netdev_max_backlog` | 65535 | 网络设备接收队列的最大数据包数量 |
| `vm.dirty_ratio` | 15 | 系统内存中"脏页"（待写入磁盘的数据）的最大比例 |
| `vm.swappiness` | 10 | 减少swap使用 |
| `vm.dirty_background_ratio ` | 5 | 后台回写进程开始工作的脏页比例阈值 |
| `fs.file-max ` | 2097152 | 系统级别最大可打开文件句柄数 |


+ 容器主机经常 hit “Too many open files” 或 “too many processes”，要同时调整 **ulimit + sysctl**。
+ 可以使用 `systemd-cgls` 查看容器对应的 cgroup 层级。

##  安全 / 网关类主机  
### 调优目标
+ 增强网络安全性
+ 降低攻击面

###  常用参数组合  
| 参数 | 推荐值 | 说明 |
| --- | --- | --- |
| `net.ipv4.conf.all.rp_filter` | 1 | 启用反向路径过滤 |
| `net.ipv4.conf.all.accept_redirects` | 0 | 禁止 ICMP 重定向 |
| `net.ipv4.conf.all.accept_source_route` | 0 | 禁止源路由包 |
| `net.ipv4.icmp_echo_ignore_broadcasts` | 1 | 忽略广播 ICMP |
| `net.ipv4.tcp_syncookies` | 1 | SYN 攻击防御 |


