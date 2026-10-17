---
title: 一次 Kubernetes 应用迁移后的压测故障排查：从 Ingress 502 到数据库连接异常
published: 2026-10-17
pinned: false
description: 应用迁移上 Kubernetes 后压测频繁 502; 一次从 Ingress 查到数据库连接、揪出应用假死的完整排查。
tags: [Kubernetes, Nginx, 网络故障]
category: 运维排错
draft: false
---

## 背景

用户应用程序从 **PCF 平台**（*Pivotal Cloud Foundry，现为 VMware Tanzu Application Service，一种基于 Cloud Foundry 的 PaaS 应用托管平台*）向 **Kubernetes** 迁移后，在压测中出现 **20% 以上的错误率**，ingress-nginx 返回了大量 **502/503/504** 错误。应用由五个微服务组成，主要是 Java 和 NodeJS 应用，后端是 **PostgreSQL** 数据库，微服务如下：

| 微服务 | 技术栈 | 作用 |
| --- | --- | --- |
| `app-gateway` | Java - Spring 框架 | 业务网关 |
| `app-auth` | Java - Spring 框架 | 用于为访问提供有效凭据 |
| `app-core` | NodeJs - Angular 框架 | 核心业务应用 |
| `app-web-ui` | NodeJs 应用、框架不明 | 核心业务应用 |
| `app-worker` / `app-worker-cb` | 架构不明 | 是业务应用，是否为直接处理用户请求不明 |

因为这个业务本身也是第三方软件外包提供的，用户团队甚至自身都不知道调用逻辑，导致排查分析非常困难。经过反复摸索，大概可以确认如下的**调用链主链**：

```
app-auth -> app-gateway -> app-core -> PostgreSQL database
```

## 初期排查

### 1. 启用特定日志格式参数

- **操作**：为 ingress-nginx 启用了 `upstream_status` 和 `upstream_bytes_received`，此配置的目的是确认后端是否接收到请求，如果接收到，`upstream_bytes_received` 不应为 0。
- **结果**：`upstream_status` 为 502/503/504，`upstream_bytes_received` 多数有值，少数为 0。这证明了**大多数请求都到达了后端**。

### 2. 修改超时时间

- **操作**：用户称应用在原平台上超时时间为 **1800 秒**，虽然我个人觉得这个值不正常，但为了防止应用本身存在耗时操作，将 ingress rule 上的 `proxy_read_timeout` 和 `proxy_write_timeout` 也调整到了 1800s。
- **结果**：在某一次测试中，**整个上下游全被阻塞**，JMeter 在压测开始后就一直没有收到任何状态返回。

### 3. 使用 curl 访问 localhost

- **操作**：exec 进入容器后，通过 curl 命令访问主业务 API。
- **结果**：发现 `app-core` 中的业务 API **没有任何响应**，在不加 `-m` 的前提下也无法触发 timeout。
- **分析**：`app-core` 业务不响应，用户虽然配置了 Probe，但却没有触发流量摘除或 Pod 重启。在 Pod 中尝试了手动 curl 健康检查端点，仍能获得正确的返回值，这说明**健康检查不能正确反映业务主进程的状态**；这一般是因为健康检查的代码实现与主业务逻辑过于解耦。

### 4. 检查应用 keepalive timeout

- **操作**：使用 `curl -v` 命令逐个检查业务 API，并提取 keepalive timeout 的值。
- **结果**：发现 `app-web-ui` 的 keepalive timeout 值为 **5**。
- **分析**：ingress-nginx 的 `upstream-keepalive-timeout` 默认值为 **60s**，如果应用设置为 5s，会导致**竞态**发生。

### 5. 检查日志

- **操作**：检查压测期间的日志。
- **结果**：发现 ingress 在触发 reload 后的四分钟，**一次性关闭了连接到 `app-core` 上超 700 条连接**。
- **分析**：ingress reload 是正常行为，由于平台使用各租户共用同一套 ingress 实例的架构，任何一个其他应用在更新了 ingress 相关配置后都会触发 ingress reload 行为。

## RCA 分析

当前可以确认的是：

- `app-core` **主业务不处理请求，但进程存活**；
- `app-core` 不响应导致连接都挂在 Pod 上不能被处理，**ingress reload 一次性关闭所有连接**；
- `app-web-ui` 的 keepalive timeout 值为 5，**比 ingress 的 `upstream-keepalive-timeout` 默认值小太多**。

### app-core 主业务假死

由于 Pod 中没有可供调试的命令，在节点上通过抓取 `cni id` 后使用 `nsenter` 进入容器的网络空间进行调试：

- `ss -antp` 显示有 **30 条 ESTAB 状态的连接**，目标都是 `192.168.10.201:5006`，后证实此 IP 是 **PostgreSQL 的负载均衡入口 IP**。
- `ss -tanoi dst 192.168.10.201:5006` 显示 30 条连接的 `lastsnd`、`lastrcv`、`lastack` 全在 72,546,000 到 72,549,000 毫秒之间，也就是大约 **20.15 小时**。这 30 条连接已经 20 个小时没有收发过任何一个包，而且是**同一时刻一起停下的**。
- 连接上**没开 TCP keepalive**，所以对端或中间设备即使早就不认这些连接了，本端也发现不了。
- `ss -K dst 192.168.10.201 dport = 5006 sport = 46746` 尝试使用此命令删除一条连接，但**所有连接都被删除了**，这可能是触发应用连接池的异常恢复或连接清理逻辑，导致其他连接随后被关闭。之后重新尝试 curl 主业务 API，**获得了正常的返回值**。
    - 值得注意的是，在执行上述操作的同时，另一个通过 `kubectl exec` 建立的交互式会话也发生了断开，但未观察到 Pod 被重新创建。
    - 这可能意味着连接终止触发了应用异常处理、连接池重建，或者导致容器内部的应用进程退出并重新启动。由于当时未记录容器重启次数及进程退出状态，*无法确认具体恢复机制*。
    - 不过，这一现象进一步表明，**数据库连接状态与业务不可用之间存在较强关联**。
- 检查了进程 file descriptor，发现 Pod 只占用了 50 个，可以**排除是文件描述符耗尽问题**。

### ingress reload 主动关闭连接

这是 ingress 的正常行为，但也能够说明后端的异常：

- ingress 在某条规则更新后，会触发 reload，其 worker 进程会滚动更新，旧 worker 上如果有还没有处理完的连接，会默认保留 **240s**；
- 在 240s 的宽限期内如果连接不能正确关闭，ingress-nginx 会**强制关闭连接**；
- 这同样说明了有 700 条挂在此 Pod 上的连接不能正确结束，最后被强制关闭，和之前关于 `app-core` 主业务假死的分析一致。

### Keepalive 超时时间不匹配可能引发连接复用竞态

1. ingress 认为一条空闲连接在 **60s** 内都可复用。
2. 后端自己的 keepalive 空闲超时更短，例如 Node.js `http.Server` 的 `keepAliveTimeout` 默认 **5s**。
3. 连接空闲约 5s 后，后端主动关闭，发出 **FIN**。
4. 如果 ingress 恰好在同一时刻（FIN 还没到达或还没被处理）从连接池取出这条连接发送请求，请求到达时后端 socket 已关闭，内核回 **RST**。
5. ingress 读取响应失败，返回 **502** 给客户端。

典型报错示例：

```
upstream prematurely closed connection while reading response header from upstream
recv() failed (104: Connection reset by peer) while reading response header from upstream
```

## 处理方法

### 1. 重写探针逻辑

既然当前端点不能正确反映主进程状态，可以**直接将 curl 主业务 API 作为探针**，例如：

```yaml
readinessProbe:
  exec:
    command: ["sh","-c","code=$(curl -s -o /dev/null -m 3 -w '%{http_code}' http://127.0.0.1:3000/api/xxx) || exit 1; [ \"$code\" = 401 ] || [ \"$code\" = 200 ]"]
  periodSeconds: 5
  timeoutSeconds: 4
  failureThreshold: 2
  successThreshold: 1
livenessProbe:
  exec:
    command: ["sh","-c","code=$(curl -s -o /dev/null -m 3 -w '%{http_code}' http://127.0.0.1:3000/api/xxx) || exit 1; [ \"$code\" = 401 ] || [ \"$code\" = 200 ]"]
  periodSeconds: 5
  timeoutSeconds: 4
  failureThreshold: 3
```

在不携带凭据的情况下，业务 API 会返回 **401**，因此将返回 401 视为正确，**超时视为失败**，以此触发 Pod 的流量摘除和重启。

**结果：**

- 进入假死约 **12 秒**后，Pod 变成 `NotReady`，被摘出流量；
- 约 **15 秒**后，liveness 判定失败，kubelet 开始 Killing；
- 约 **45 秒**后，Pod 真正完成重启（Node 进程不处理 `SIGTERM`，要等默认 30 秒的 `terminationGracePeriod` 后被 `SIGKILL`，退出码 `137`）；
- 重启后业务接口重新返回 401。

:::tip
当前探针是针对应用假死问题的**临时缓解方案**。长期来看，应分别设计 Readiness 与 Liveness 检查，避免将下游依赖的短暂不可用直接等同于应用进程必须重启。
:::

### 2. 调大后端 keepalive

把后端 keepalive 空闲超时调得**比 ingress 长**。ingress 默认 60s，后端建议设为 **65s 或更长**。

### 3. 增加数据库最大连接数

- **`maxDBConnections` 从 30 调到 100**（4 副本合计最多 400）。之后的压测没有再卡住（*但这可能只是推迟了卡死的时间*）。

## 还没解决的问题

- **连接为什么会卡住且不释放？** 需要开发者确认：是否设置了获取连接超时、查询超时、空闲连接回收，是否开启 TCP keepalive。
- `/status` 应该做成**能反映真实处理能力的健康检查**（至少检查连接池是否可用），而不是只返回 200。

## 几点体会

- **超时调大不是修复**：它只会让“卡死”看起来像“慢”。看到 504 耗时总是正好等于超时值，就该怀疑后端完全不响应。
- **“进程活着”不等于“服务可用”**：只检查进程或静态端点的探针，抓不住这类假死。
- **任何资源池都要有超时**：连接池、线程池、队列，只要会等，就要有等待上限，否则一次异常就能让进程永久卡住。
- **先分层确认问题在哪一层**：ingress 日志的 `upstream_status`、Pod 内 `curl 127.0.0.1`、`ss` 看连接，这三步基本就能把“平台问题”和“应用问题”分开。

# 最后一次压测结果
在完成以上的处置后，最新一次压测的错误率为`0.01%`，达到了应用发布的标准
