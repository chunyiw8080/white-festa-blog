---
title: 磁盘IO、IO指标分析及IO调度器
published: 2025-11-03
pinned: false
description: 通过iostat、sar命令进行磁盘IO性能分析、调整IO调度器进行IO优化的方法
tags: [磁盘, Linux性能优化]
category: Linux
draft: false
---

# 一、磁盘 IO 性能分析
## 1. iostat - 监控磁盘设备 IO 指标
### 使用
```bash
iostat -x 1 1
```

输出

```bash
Device  r/s   rkB/s  rrqm/s  %rrqm  r_await  rareq-sz  w/s   wkB/s  wrqm/s  %wrqm  w_await  wareq-sz  d/s   dkB/s  drqm/s  %drqm  d_await  dareq-sz  f/s   f_await  aqu-sz  %util
sda     3.47  83.85  0.00    0.00   0.29     24.18     0.26  12.47  0.00    0.00   0.82     47.64     0.00  0.00   0.00    0.00   0.00     0.00      0.08  0.63     0.00    0.06
```

### 指标含义
#### 读请求相关
| 字段 | 含义 | 单位 | 说明 |
| --- | --- | --- | --- |
| **r/s** | 每秒读请求次数（读 IOPS） | 次/秒 | 表示平均每秒发出的读操作数量。值越大说明磁盘读请求越频繁。 |
| **rkB/s** | 每秒读数据量 | KB/秒 | 每秒从设备读取的数据量。反映读吞吐率。 |
| **rrqm/s** | 每秒合并的读请求数 | 次/秒 | 内核 I/O 调度器将多个相邻读请求合并后统计的次数。高说明系统在合并小块请求。 |
| **%rrqm** | 合并读请求比例 | % | = `rrqm/s ÷ (r/s + rrqm/s) × 100`，表示有多少读请求被合并。 |
| **r_await** | 平均每个读请求的等待时间 | 毫秒 | 包括排队 + 服务时间。数值过高说明读延迟严重。 |
| **rareq-sz** | 平均每次读请求大小 | KB | 表示每个读请求平均传输的数据量。较大通常说明顺序读较多。 |


#### 写请求相关
| 字段 | 含义 | 单位 | 说明 |
| --- | --- | --- | --- |
| **w/s** | 每秒写请求次数（写 IOPS） | 次/秒 | 平均每秒发出的写操作数量。 |
| **wkB/s** | 每秒写数据量 | KB/秒 | 每秒写入的数据量。反映写吞吐率。 |
| **wrqm/s** | 每秒合并的写请求数 | 次/秒 | 合并的小块写请求次数。 |
| **%wrqm** | 合并写请求比例 | % | = `wrqm/s ÷ (w/s + wrqm/s) × 100` |
| **w_await** | 平均每个写请求等待时间 | 毫秒 | 包括排队 + 服务时间。高说明写延迟大。 |
| **wareq-sz** | 平均每次写请求大小 | KB | 较大说明写操作偏顺序。 |


#### 逻辑删除（discard）相关
discard 是系统或文件系统主动发出的、合法的`块释放`请求，被标记删除的块将不会再被使用，Background GC 可以在非关键时段擦除这些块数据。

| 字段 | 含义 | 单位 | 说明 |
| --- | --- | --- | --- |
| **d/s** | 每秒 discard 请求次数 | 次/秒 | 丢弃（如 TRIM、discard）操作数，用于 SSD 空间回收。 |
| **dkB/s** | 每秒 discard 数据量 | KB/秒 | 表示 TRIM 的数据吞吐量。 |
| **drqm/s** | 每秒合并的 discard 请求数 | 次/秒 | 同 rrqm/s、wrqm/s，对 discard 操作的合并。 |
| **%drqm** | 合并 discard 比例 | % | = `drqm/s ÷ (d/s + drqm/s) × 100`。 |
| **d_await** | 平均 discard 请求等待时间 | 毫秒 | discard 操作的延迟。 |
| **dareq-sz** | 平均每次 discard 请求大小 | KB | 平均 discard 的数据块大小。 |


#### flush 相关
flush：将内存脏页数据持久化到磁盘上

| 字段 | 含义 | 单位 | 说明 |
| --- | --- | --- | --- |
| **f/s** | 每秒 flush 请求次数 | 次/秒 | 每秒 fsync()/barrier 等 flush 请求次数，常见于数据库或文件系统 sync。 |
| **f_await** | 平均 flush 请求等待时间 | 毫秒 | flush 操作的平均延迟。 |
| **aqu-sz** | 平均请求队列长度 | 请求数 | 表示平均在队列中的 I/O 数量。>1 时说明设备存在排队。 |
| **%util** | 设备利用率 | % | 表示设备在采样周期内有多少时间在处理 I/O。接近 100% 说明设备已饱和。 |


###  扩展指标速查与诊断建议  
| 指标名 | 含义 | 异常参考值 | 诊断建议 |
| :--- | :--- | :---: | :--- |
| **r/s** | 每秒读请求数 (IOPS - read) | 取决于业务 | 读请求数量多但延迟高时，可能存在随机读瓶颈；结合 `r_await` 判断延迟来源。 |
| **w/s** | 每秒写请求数 (IOPS - write) | 取决于业务 | 写请求过多且延迟上升时，可能是磁盘缓存耗尽或日志写密集型应用引起。 |
| **rkB/s** | 每秒读数据量 (KB/s) | — | 读带宽高但 `r/s` 不高时，多为顺序读（大块 I/O）。 |
| **wkB/s** | 每秒写数据量 (KB/s) | — | 与 `w/s` 结合判断是小块高频写还是大块顺序写。 |
| **rrqm/s** | 每秒合并的读请求数 | 高值一般正常 | 表示 I/O 调度器合并了多个小读请求；数值高代表调度器在起作用。 |
| **wrqm/s** | 每秒合并的写请求数 | 高值一般正常 | 与 `rrqm/s` 类似，写请求合并；低延迟设备（如 SSD）上该值较低也属正常。 |
| **%rrqm** | 被合并的读请求占比 | <20% 一般正常 | 若过高且延迟上升，可能 I/O 队列过长或调度器过度合并。 |
| **%wrqm** | 被合并的写请求占比 | <20% 一般正常 | 过高时需关注调度器和文件系统写入模式。 |
| **r_await** | 平均读请求等待时间 (ms) | SSD：<1 ms；HDD：<10 ms | 若持续升高，说明存储层读延迟大（I/O 等待、队列拥塞或坏盘）。 |
| **w_await** | 平均写请求等待时间 (ms) | SSD：<2 ms；HDD：<20 ms | 高延迟可能由写放大、缓存写满或 sync 写操作造成。 |
| **rareq-sz** | 平均每次读请求大小 (KB) | — | 数值大 → 顺序读；数值小 → 随机读。 |
| **wareq-sz** | 平均每次写请求大小 (KB) | — | 数值大 → 顺序写；数值小 → 随机写。 |
| **aqu-sz** | 平均请求队列长度 | 0.5 以下最佳 | 若大于 1 且 `%util` 高，表示磁盘队列积压。 |
| **await** | 平均 I/O 等待时间（含排队） | SSD：<1 ms；HDD：<10 ms | 等价于 `(r_await + w_await)` 加权平均；持续上升代表设备响应慢。 |
| **svctm** | 单次请求服务时间（不含排队） | 越低越好 | `await` 远大于 `svctm` → 排队延迟严重。 |
| **%util** | 设备利用率（忙碌时间比例） | >80% 需关注，>95% 表示瓶颈 | 表示磁盘忙碌程度。高于 90% 时磁盘接近饱和。 |
| **kB_read/s** / **kB_wrtn/s** | 读写带宽 | 与业务相关 | 带宽高但 IOPS 低，说明顺序 I/O 占主导。 |
| **kB_dscd/s** | 每秒 discard 数据量 | SSD 常见 | 大量 discard 说明频繁文件删除或 trim 操作。 |


### 模拟场景
1. 缓存雪崩

IO 指标如下：  
`r/s 335k, rawait 1.1ms, rrqm/s 180191.75, %rrqm 35%, rareq_sz 25.85 %util 81%`

已知该服务器部署在 kvm 虚拟机中，同一物理机（使用的是固态硬盘）上的另外一台 kvm 虚拟局上部署了 MySQL 服务，那么导致 IO 指标异常的原因的分析如下：

+ r/s 335k - 说明 IO 压力主要是在读上
+ rawait 1.1ms - 对于 SSD 来说是一个偏高的值
+ %rrqm 35% - 说明 35%的读请求被合并了
+ rareq_sz 25.85 - 说明读请求属于中等大小，一般出现在混合型访问中，即既有大文件顺序读，也有小文件随机读
+ %util 81% - 没有达到瓶颈，但接近

整改：

+ 对于 固态硬盘来说，随机读的性能本来就比较高。35%的读请求合并是不必要的，因此可以先将 io 调度器改为 None，提高读效率
+ 大量缓存键同时到期，导致读请求被发到 MySQL 服务上，由于 MySQL 和 Redis 部署在同一物理机上，因此 MySQL 虚拟机中飙升的 IO 负载也会影响到 Redis 服务，即同一物理机上虚拟化层的资源竞争
+ 长期整改措施：
    - 为 key 引入随机 TTL，防止 key 集体过期
    - 启用互斥机制：缓存 miss 时，让只有一个请求去后端加载并回填数据，其他请求等待该请求完成
    - 预热和定期刷新热点
    -  使用合适的 `maxmemory-policy`（如 `allkeys-lru` 或 `volatile-lru`），避免大量突然到期导致内存短缺与 swap。  
    -  如果 Redis 作为纯缓存，可以考虑关闭 RDB/AOF，或把持久化策略调整为对 I/O 影响最小的配置（`appendfsync everysec`、避免频繁 rewrite）。  
2.  顺序写压力场景

IO 指标如下：

`r/s 50, w/s 120k, wareq_sz 1024kb, wawait 0.8ms, %wrqm 80%, %util 68%`

分析：

+ w/s 120k - 主要压力是写操作
+ wareq_sz 1024kb - 说明是大文件顺序写
+ wawait 0.8ms - 稍高但仍然理想的写延迟
+ %wrqm 80% - 80%的写请求合并，虽然很高，但写合并对顺序写是有正面效果的
+ %util 68% - 设备利用率 68%，属于偏高当仍可接受的范围内

总结：

不需要做额外调整，整体来看 IO 指标属于负载略高但仍可控，只要能确保写延迟和利用率保持稳定，就不需要额外操作

## 2. sar - 监控系统层 IO 指标
### 使用
```bash
sar -b
```

输出

```bash
Linux 6.1.0 (example-host)    11/09/2025

12:30:00 AM   tps   rtps   wtps   dtps   bread/s   bwrtn/s   bdscd/s
12:30:01 AM  85.00  10.00  75.00   0.00   800.00   1500.00     0.00
12:30:02 AM  90.00  12.00  78.00   0.00   900.00   1600.00     0.00
Average:     87.50  11.00  76.50   0.00   850.00   1550.00     0.00
```

解读：

+ 系统平均每秒发出约 87 次 I/O 请求；
+ 其中读操作约占 11 次/s，写操作约占 76 次/s；
+ 每秒读取约 850 块数据（假设块为 4KB，就是 ~3.4MB/s）；
+ 每秒写入约 1550 块数据（约 6.2MB/s）；
+ 没有执行 discard 操作。

### 指标含义
| 字段名 | 全称 | 含义 | 单位 | 说明 |
| --- | --- | --- | --- | --- |
| **tps** | Transactions Per Second | 每秒向块设备发出的 I/O 请求次数（读+写+丢弃的总数） | 次/秒 | 粗略代表 I/O 请求的频率，**不是磁盘 IOPS**（因为每个请求大小不同） |
| **rtps** | Read Transactions Per Second | 每秒执行的**读请求**数 | 次/秒 | 只统计读操作次数 |
| **wtps** | Write Transactions Per Second | 每秒执行的**写请求**数 | 次/秒 | 只统计写操作次数 |
| **dtps** | Discard Transactions Per Second | 每秒执行的**discard（丢弃/TRIM）请求**数 | 次/秒 | 表示 SSD 上被逻辑删除或释放的块数目 |
| **bread/s** | Blocks Read per Second | 每秒从块设备**读取的块数** | 块/秒 | 块大小通常为 512B 或 4KB，取决于设备与内核配置 |
| **bwrtn/s** | Blocks Written per Second | 每秒**写入的块数** | 块/秒 | 衡量写入数据流量 |
| **bdscd/s** | Blocks Discarded per Second | 每秒**被 discard 的块数** | 块/秒 | 表示逻辑上释放（非真实删除）的块数 |


# 二、磁盘IO调度器和参数
Linux I/O调度器是内核中的一个组件，负责管理块设备的I/O请求队列。它决定了内核如何将多个进程发出的读写请求分配给块设备，主要目标是：

+ 减少磁盘寻道时间：通过重新排序请求
+ 公平性：防止某个进程饿死其他进程
+ 优先级处理：确保重要请求优先处理
+ 合并请求：将相邻的小请求合并成大请求

## 1. 主要的I/O调度器类型
### None
1. **原理**：几乎不做调度，I/O 请求直接发送到驱动层；
2. **优点**：延迟极低，开销最小；
3. **缺点**：不具备公平性或顺序优化；
4. **推荐使用**：
    1. NVMe SSD（自带内部队列与调度）；
    2. 虚拟机磁盘（由宿主机或存储后端调度）；
    3. RAID 控制卡、自带缓存的企业级磁盘。

### mq-deadline  
1. **原理**：为每个多队列（multi-queue）块设备独立维护读写队列；
    1. 读请求优先；
    2. 请求按“截止时间（deadline）”排序；
2. **优点**：在 SSD 和机械盘上都有良好性能；
3. **缺点**：极端高并发下略有调度开销；
4. **推荐使用**：
    1. 通用服务器；
    2. 高并发读写场景（如 Web、数据库）；
    3. 系统盘、缓存盘。

###  bfq（Budget Fair Queueing）  
1. **原理**：基于“带宽预算”的公平队列调度；
    1. 每个进程分配一个带宽预算；
    2. 适合小文件随机读写；
2. **优点**：交互性强、延迟稳定；
3. **缺点**：整体吞吐量略低；
4. **推荐使用**：
    1. 桌面系统；
    2. 工作站；
    3. 媒体处理或多任务场景（如 IDE + 编译 + 视频播放）

###  kyber  
1. **原理**：为多队列块设备设计（如 NVMe）；
    1. 使用“延迟目标”控制读写；
    2. 将 I/O 分类为 latency-sensitive 与 background；
2. **优点**：在数据中心和高 IOPS 场景中延迟控制优秀；
3. **缺点**：对顺序访问优化较弱；
4. **推荐使用**：
    1. NVMe SSD；
    2. 高并发数据库（MySQL、PostgreSQL）；
    3. 存储节点、Kubernetes worker 节点。

## 2. 使用场景
| 场景 | 推荐调度器 | 理由 |
| --- | --- | --- |
| NVMe SSD（高性能） | `none` 或 `kyber` | 硬件自带调度，none 延迟最低；kyber 适合控制延迟目标 |
| SATA SSD | `mq-deadline` | 延迟与吞吐平衡良好 |
| 机械硬盘 | `bfq` 或 `mq-deadline` | 提升交互性或保证延迟 |
| 桌面系统 | `bfq` | 公平性与响应时间更好 |
| 数据库服务器 | `kyber` 或 `mq-deadline` | 低延迟和稳定性优先 |
| 虚拟机 / 宿主机 | `none` | 调度由上层虚拟化层完成 |
| 容器节点（Kubernetes Worker） | `mq-deadline` 或 `none` | 在共享块设备上提供可预期性能 |


# 三、IO 参数
##  1. 调度与请求控制  
| 参数名 | 示例值 | 说明 | 典型调优策略 |
| --- | --- | --- | --- |
| **scheduler** | `[mq-deadline] kyber bfq none` | 当前使用的 I/O 调度器（方括号中为当前启用项） | SSD：`none`；HDD：`mq-deadline` 或 `bfq` |
| **nr_requests** | `128` | 队列中允许的最大挂起请求数 | 提高可提升并发吞吐（常调为 256 或 512） |
| **nomerges** | `0/1/2` | 是否合并相邻 I/O 请求：0=启用；1=只合并前后；2=禁用 | 高并发测试/SSD 可设为 `2` 降低延迟 |
| **add_random** | `1/0` | 是否将设备参与随机性熵池生成（对 `/dev/random`） | 建议 SSD/虚拟机关闭：`echo 0 > add_random` |
| **iostats** | `1/0` | 是否启用 I/O 统计收集（用于 `iostat` 等） | 若极端追求性能，可关闭：`echo 0 > iostats` |


## 2. 性能相关
| 参数名 | 示例值 | 说明 | 调优建议 |
| --- | --- | --- | --- |
| **read_ahead_kb** | `128` | 预读缓存大小（顺序读取时会预先读取的数据量） | SSD 通常 `16~64`；HDD 可 `128~512` |
| **max_sectors_kb** | `512` | 单次 I/O 最大传输扇区（1 扇区=512B） | 一般不改；NVMe 通常 1024 或更高 |
| **logical_block_size** | `512` | 逻辑扇区大小（操作系统视角） | 固定值，不建议修改 |
| **physical_block_size** | `4096` | 物理扇区大小（设备实际） | 固定值，仅供对齐计算 |
| **minimum_io_size** | `4096` | 设备建议的最小 I/O 单位 | 文件系统格式化时参考 |
| **optimal_io_size** | `0` 或 `1048576` | 设备最佳 I/O 大小（顺序读写优化） | SSD/RAID 设备中较有意义 |
| **max_segments  ** | `128` |  一次 I/O 操作最多可以打包的物理内存页数量 |  通常无需手动修改（由驱动定义） |
| **max_segment_size  ** | `65536` | 单个 segment 的最大字节数。   |  一般由驱动自动设定   |
| **minimum_io_size**   | `4096` |  表示**设备建议的最小 I/O 操作大小** |  不要随意修改 |


## 3. **延迟与并行控制**
| 参数名 | 示例值 | 说明 | 调优思路 |
| --- | --- | --- | --- |
| **rq_affinity** | `1` | I/O 完成中断是否在同 CPU 处理：0=任意CPU；1=同CPU | 多核系统一般保留 `1` 提高缓存命中 |
| **nr_zones** | `0` | ZNS/Zoned设备的zone数 | 仅对SMR磁盘/Zone设备有效 |
| **write_cache** | `write back` / `write through` | 写缓存策略（由硬件控制） | SSD保持`write back`以提升速度 |
| **rotational** | `0` / `1` | 是否为旋转介质（0=SSD,1=HDD） | 只读项；影响调度器默认行为 |


## 4. **多队列(MQ) 机制相关参数**
>  现代 Linux 内核（≥3.13）使用 `blk-mq`（Block MultiQueue）架构管理 I/O。  
>

| 参数名 | 示例值 | 说明 | 调优场景 |
| --- | --- | --- | --- |
| **nr_hw_queues** | `1` / `4` / `8` | 设备支持的硬件队列数 | NVMe 通常为 CPU 数量级 |
| **queue_depth** | `256` | 每个队列可挂起的请求数 | 高性能SSD通常可到`1024` |
| **poll_delay** | `-1` | I/O 轮询延迟 | 仅在 `iopoll` 启用时有效 |
| **io_poll** | `0/1` | 启用 I/O 轮询模式（减少中断） | 高IOPS SSD可开启 |
| **io_poll_delay** | `-1` | 控制轮询等待时间 | 专业调优场景使用 |


##  5. 数据完整性与安全相关  
| 参数名 | 示例值 | 说明 | 调优建议 |
| --- | --- | --- | --- |
| **discard_granularity** | `512` 或 `4096` | 支持的 TRIM（discard）最小粒度 | 与 SSD 对齐优化有关 |
| **discard_max_bytes** | `2147483648` | 单次最大 discard 操作大小 | 自动识别，通常不修改 |
| **write_same_max_bytes** | `0` | 一次性写相同数据最大字节数 | 支持 `WRITE SAME` 指令时有效 |
| **security_erase_unit** | `0` | 支持安全擦除的单位大小 | 一般为只读信息 |


##  6. 数据完整性与安全相关  
| 参数名 | 示例值 | 说明 | 调优建议 |
| --- | --- | --- | --- |
| **discard_granularity** | `512` 或 `4096` | 支持的 TRIM（discard）最小粒度 | 与 SSD 对齐优化有关 |
| **discard_max_bytes** | `2147483648` | 单次最大 discard 操作大小 | 自动识别，通常不修改 |
| **write_same_max_bytes** | `0` | 一次性写相同数据最大字节数 | 支持 `WRITE SAME` 指令时有效 |
| **security_erase_unit** | `0` | 支持安全擦除的单位大小 | 一般为只读信息 |


## 7. 使用
### 查看设备支持的调度器  
```bash
cat /sys/block/sda/queue/scheduler
```

输出：

```bash
[mq-deadline] kyber bfq none
```

其中方括号中的是当前正在使用的调度器类型

### 临时切换调度器
```bash
echo none > /sys/block/sda/queue/scheduler
```

### 使用udev 永久性修改调度器类型和参数
#### 配置文件路径
 测试用规则放 `/etc/udev/rules.d/`，生产系统放 `/lib/udev/rules.d/`

#### 原理  
Linux 启动或检测到新磁盘时，`udev` 会触发“设备事件”（`add`, `change`, `remove` 等）。  
可以编写一条 `**udev**`** 规则（*.rules 文件）**，在磁盘添加时自动写入参数值。

这些参数（例如 `scheduler`、`nr_requests`、`read_ahead_kb` 等）都是通过 sysfs 文件暴露的：

```bash
/sys/block/sda/queue/scheduler
/sys/block/sda/queue/nr_requests
/sys/block/sda/queue/read_ahead_kb
```

 所以规则的核心逻辑其实就是：  

>  当检测到新 block 设备（/dev/sd*）时，用 `ATTR{}` 写入目标参数。  
>

#### 示例
1. 创建规则文件（保持文件名数字较大，如 `60+`，确保在系统默认规则之后执行）

```bash
/etc/udev/rules.d/60-ssd-io-optimize.rules
```

2. 插入规则

```bash
ACTION=="add|change", KERNEL=="sd[a-z]", SUBSYSTEM=="block", \
    ATTR{queue/scheduler}="none", \
    ATTR{queue/nomerges}="2", \
    ATTR{queue/nr_requests}="256", \
    ATTR{queue/add_random}="0", \
    ATTR{queue/read_ahead_kb}="16"
```

3.  调试规则  

```bash
udevadm test /sys/block/sda
```

4. 重新加载规则

```bash
udevadm control --reload
```

5. 手动触发规则

```bash
udevadm trigger
# 或者限定类型与匹配设备
udevadm trigger --type=devices --subsystem-match=block
```

#### 写入失败
如果 udev 报错 “cannot write attribute”，原因通常是：

+ 设备还没完全初始化 → 可以加一点延时或用 `change` 事件。
+ 某些参数（如 `scheduler`）被驱动锁定为只读。

解决方法：在规则中添加一条条件触发 `RUN+=` 命令，例如：

```bash
ACTION=="add|change", KERNEL=="sd[a-z]", SUBSYSTEM=="block", \
    RUN+="/bin/bash -c 'echo none > /sys/block/%k/queue/scheduler'"
```

 这种写法等价于手动 `echo`，适用于不能直接用 `ATTR{}` 修改的参数。  

# 四、fio IO 测试工具
```bash
fio --name=test --rw=randread --bs=4k --size=1G --runtime=10 --ioengine=libaio --iodepth=16
# 或者输出为json模式，更易读
fio --name=test --rw=randread --bs=4k --size=1G --runtime=10 --ioengine=libaio --iodepth=16 --output-format=json --output=fio_res.json
```

输出结果

```bash
test: (g=0): rw=randread, bs=(R) 4096B-4096B, (W) 4096B-4096B, (T) 4096B-4096B, ioengine=libaio, iodepth=16
fio-3.41
Starting 1 process
Jobs: 1 (f=1): [r(1)][100.0%][r=19.9MiB/s][r=5100 IOPS][eta 00m:00s]
test: (groupid=0, jobs=1): err= 0: pid=12757: Sun Nov  9 17:41:07 2025
  read: IOPS=4959, BW=19.4MiB/s (20.3MB/s)(194MiB/10001msec)
    slat (usec): min=104, max=10568, avg=198.60, stdev=68.82
    clat (usec): min=3, max=15012, avg=3021.31, stdev=372.17
     lat (usec): min=205, max=15221, avg=3219.91, stdev=387.61
    clat percentiles (usec):
     |  1.00th=[ 2507],  5.00th=[ 2671], 10.00th=[ 2769], 20.00th=[ 2868],
     | 30.00th=[ 2900], 40.00th=[ 2933], 50.00th=[ 2999], 60.00th=[ 3032],
     | 70.00th=[ 3064], 80.00th=[ 3163], 90.00th=[ 3261], 95.00th=[ 3392],
     | 99.00th=[ 4178], 99.50th=[ 4817], 99.90th=[ 6521], 99.95th=[ 9110],
     | 99.99th=[15008]
   bw (  KiB/s): min=18424, max=20600, per=100.00%, avg=19841.60, stdev=498.42, samples=20
   iops        : min= 4606, max= 5150, avg=4960.40, stdev=124.61, samples=20
  lat (usec)   : 4=0.01%, 250=0.01%, 500=0.01%, 750=0.01%, 1000=0.01%
  lat (msec)   : 2=0.01%, 4=98.88%, 10=1.07%, 20=0.03%
  cpu          : usr=1.22%, sys=8.41%, ctx=49604, majf=0, minf=22
  IO depths    : 1=0.1%, 2=0.1%, 4=0.1%, 8=0.1%, 16=100.0%, 32=0.0%, >=64=0.0%
     submit    : 0=0.0%, 4=100.0%, 8=0.0%, 16=0.0%, 32=0.0%, 64=0.0%, >=64=0.0%
     complete  : 0=0.0%, 4=100.0%, 8=0.0%, 16=0.1%, 32=0.0%, 64=0.0%, >=64=0.0%
     issued rwts: total=49604,0,0,0 short=0,0,0,0 dropped=0,0,0,0
     latency   : target=0, window=0, percentile=100.00%, depth=16

Run status group 0 (all jobs):
   READ: bw=19.4MiB/s (20.3MB/s), 19.4MiB/s-19.4MiB/s (20.3MB/s-20.3MB/s), io=194MiB (203MB), run=10001-10001msec

Disk stats (read/write):
    dm-0: ios=49133/7, sectors=393064/96, merge=0/0, ticks=8327/3, in_queue=8330, util=83.35%, aggrios=49604/7, aggsectors=396832/96, aggrmerge=0/0, aggrticks=8967/6, aggrin_queue=8976, aggrutil=86.32%
  sda: ios=49604/7, sectors=396832/96, merge=0/0, ticks=8967/6, in_queue=8976, util=86.32%
```

