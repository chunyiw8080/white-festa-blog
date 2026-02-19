---
title: Kubernetes节点压力驱逐、cgroups与Kernel OOM之间的关系
published: 2025-12-10
pinned: true
description: Kubernetes内存管理深度解析：当内存不足时，Pod如何被驱逐或杀死？本文从节点驱逐、cgroups限制、内核OOM三个层面，结合Logstash实例追踪cgroups路径，详解QoS与oom_score_adj如何决定Pod生死。
tags: [Kubernetes]
category: DevOps
draft: false
---
Kubernetes 的内存管理是一个多层级的精密体系。当 Pod 因内存压力被杀死时，其决策可能发生在三个不同的层面：
- 调度层：kubelet 基于 Pod 的 QoS 和资源使用量，主动进行有序驱逐。
- 容器层：通过 Linux cgroups 强制实施 Pod 的内存限制（limits.memory）。
- 内核层：当进程触发 cgroup 内存上限（memory.max）或系统全局内存枯竭时，由内核 OOM 机制介入，选择进程终止。

这三者环环相扣，共同决定了 Pod 的“生死”。本文将逐一讨论这三种情况，并通过在真实节点上追踪一个 Logstash Pod 的 cgroups 路径与内核参数，直观展示这套机制是如何运作的。
# Kubernetes 节点压力驱逐机制
Kubernetes 节点压力驱逐的顺序受两个因素影响，分别是``Quality of Service``、``PriorityClass``与实际的``资源使用量``
首先是看Qos，驱逐先后顺序如下：
| QoS        | 条件                     | 特点     |
| ---------- | ---------------------- | ------ |
| Guaranteed | request == limit       | 最不容易被杀 |
| Burstable  | 有 request / limit 但不相等 | 中间     |
| BestEffort | 没有任何 request/limit     | 最容易被杀  |

其次看PriorityClass：同一Qos中，PriorityClass更高的更容易存活

最后看资源使用量：同一Qos且PriorityClass相同的情况下(默认为0或者使用了同一PriorityClass)：内存使用量更大的更容易被驱逐

# Kubelet如何通过cgroups配置影响OOM行为(基于cgroups v2)
首先要知道，kubernetes所有的对资源的统计、管理、限额和驱逐都是基于cgroups实现的
## kubernetes Pod 在 Node主机上的cgroups映射
以一个logstash pod为例。
首先，查看该Pod被部署在了哪个Node上：
```bash
[root@k8s-master-05 logstash]# kubectl get pods -n logging -o wide | grep logstash
logstash-7c748fcf64-nt52r            1/1     Running   0               116m    10.244.232.85    k8s-node-06   <none>           <none>
```
然后，需要查看Pod的uid：
```bash
[root@k8s-master-05 logstash]# kubectl get pod -n logging logstash-7c748fcf64-nt52r -o jsonpath='{.metadata.uid}'
745d59b2-bda3-4f6d-94a2-c5bafa3560b9
```
在k8s-node-06主机上，找到对应的cgroups目录
```bash
/sys/fs/cgroup/kubepods.slice/kubepods-burstable.slice/kubepods-burstable-pod745d59b2_bda3_4f6d_94a2_c5bafa3560b9.slice
```

- 在这个目录中，``/sys/fs/cgroup/`` 是固有的cgroups控制组目录，可以用来管理主机上的进程。
- ``kubepods.slice``存放了所有kubernetes Pod的控制组，其下还有三种目录，分别是``kubepods-besteffort.slice``，``kubepods-burstable.slice``和``kubepods-guaranteed.slice``，分别代表了三种不同的QoS等级。
- 最后，``kubepods-burstable-pod745d59b2_bda3_4f6d_94a2_c5bafa3560b9.slice``目录则是实际的Pod在节点上cgroups映射，其中``745d59b2_bda3_4f6d_94a2_c5bafa3560b9``就是之前获取的Pod uid。

在这之中，通常还会有至少两个容器，一个是主业务容器，一个是Pause容器，例如：
```bash
[root@k8s-node-06 kubepods-burstable-pod745d59b2_bda3_4f6d_94a2_c5bafa3560b9.slice]# ls -d */
cri-containerd-3d9508ad8b835c31b9ab4551b977bf16bef8025f6bfb61c17a8da9b60e50fd4b.scope/
cri-containerd-557e374182e9f183aac7b6537d44d8a74565891a231468599032dce0f6b9cad2.scope/
```
### 第一个目录
查看pid
```bash
[root@k8s-node-06 cri-containerd-3d9508ad8b835c31b9ab4551b977bf16bef8025f6bfb61c17a8da9b60e50fd4b.scope]# cat cgroup.procs 
154733
```
根据pid查看对应的进程：
```bash
[root@k8s-node-06 cri-containerd-3d9508ad8b835c31b9ab4551b977bf16bef8025f6bfb61c17a8da9b60e50fd4b.scope]# ps -fp 154733
UID          PID    PPID  C STIME TTY          TIME CMD
65535     154733  154706  0 17:35 ?        00:00:00 /pause
```
可以看出这个容器就是logstash Pod的Pause容器。
### 第二个目录
查看pid
```bash
[root@k8s-node-06 cri-containerd-3d9508ad8b835c31b9ab4551b977bf16bef8025f6bfb61c17a8da9b60e50fd4b.scope]# cd ../cri-containerd-557e374182e9f183aac7b6537d44d8a74565891a231468599032dce0f6b9cad2.scope/
[root@k8s-node-06 cri-containerd-557e374182e9f183aac7b6537d44d8a74565891a231468599032dce0f6b9cad2.scope]# cat cgroup.procs 
164485
164497
```
根据pid查看对应进程
```bash
[root@k8s-node-06 ~]# ps -fp 164485
UID          PID    PPID  C STIME TTY          TIME CMD
1000      164485  154706  0 17:47 ?        00:00:00 /bin/sh -c /opt/logstash/bin/logstash -f /opt/logstash/confi
```
以及
```bash
[root@k8s-node-06 ~]# ps -fp 164497
UID          PID    PPID  C STIME TTY          TIME CMD
1000      164497  164485  2 17:47 ?        00:03:26 /opt/logstash/jdk/bin/java -Xms1g -Xmx1g -XX:+UseConcMarkSwe
```
进入到logstash进行验证
```bash
[root@k8s-master-05 logstash]# kubectl exec -it -n logging logstash-7c748fcf64-nt52r -- sh
$ ps -aux
USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
logstash       1  0.0  0.0   2624    96 ?        Ss   09:47   0:00 /bin/sh -c /opt/logstash/bin/logstash -f /opt/logstash/config/
logstash       6  2.7 16.9 5012196 1029084 ?     Sl   09:47   3:27 /opt/logstash/jdk/bin/java -Xms1g -Xmx1g -XX:+UseConcMarkSweep
logstash     197  0.0  0.0   2624  1672 pts/0    Ss   11:51   0:00 sh
logstash     203  0.0  0.0   8904  3380 pts/0    R+   11:51   0:00 ps -aux
```
可见164485和164497这两个进程就是容器化的logstash进程在Node主机上的映射

## 查看Pod的request和limit在cgroups控制组中的映射
1. 查看Pod限制
```bash
[root@k8s-master-05 logstash]# kubectl get pods -n logging logstash-7c748fcf64-nt52r  -o jsonpath='{range .spec.containers[*]}{"容器:"}{.name}{"\n"}{"CPU请求:"}{.resources.requests.cpu}{" "}{"CPU限制:"}{.resources.limits.cpu}{"\n"}{"内存请求:"}{.resources.requests.memory}{" "}{"内存限制:"}{.resources.limits.memory}{"\n"}{end}'
容器:logstash
CPU请求:500m CPU限制:1
内存请求:512Mi 内存限制:1Gi
```

2. 查看cgroups memory.max参数
```bash
[root@k8s-node-06 cri-containerd-557e374182e9f183aac7b6537d44d8a74565891a231468599032dce0f6b9cad2.scope]# cat memory.max | awk '{print $1/1024/1024}'
1024
```
内存上限与Pod limits相符

3. 查看 cpu.max参数
```bash
[root@k8s-node-06 cri-containerd-557e374182e9f183aac7b6537d44d8a74565891a231468599032dce0f6b9cad2.scope]# cat cpu.max
100000 100000
```
即最多无限制地使用1个CPU。

由此可见，kubelet是完全依靠cgroups管理资源的。

## OOM为何能够同时杀死一个容器中的多个进程？
这里依靠的是``memory.oom.group``参数，该参数使 OOM 发生时以 Pod 为单位整体终止容器进程。

在 cgroups v1 时代，Linux 内核并没有提供直接向整个 cgroup 内所有进程同时发送终止信号的原子操作。当 Kubernetes 需要终止一个 Pod 中的所有进程时（例如删除 Pod 或容器失败），实际工作是由容器运行时（如 Docker、containerd）完成的，其核心机制是遍历 cgroup 内的进程列表并逐个发送信号。

因此，在一些极端情况中，存在容器进程从kubelet中逃逸的现象，也就是说，kubelet判断Pod已经终止，然而Pod中的部分容器进程仍存在与宿主机上，表现为节点端口被不明进程占中，持续占有内存资源等。
```bash
[root@k8s-node-06 cri-containerd-557e374182e9f183aac7b6537d44d8a74565891a231468599032dce0f6b9cad2.scope]# cat memory.oom.group 
1
```

# 内核级OOM
内核级OOM依靠的是另一套机制：``oom_score``和``oom_score_adj``

## oom_score
Linux内核通过一套启发式算法，持续为每个进程维护一个``oom_score``，这个范围一般是在0-1000，不过实际上没有上限。内核会在 OOM 发生时，根据这套启发式算法重新评估各候选进程的 oom_score，并从 oom_score 分数最高的进程开始杀，直到系统获得足够的可用内存。
## oom_score_adj
``oom_score_adj``是用来计算``oom_score``的一个重要参数，同时他也代表了人为赋予的进程优先级。
一般范围是从-1000到1000，其中内核级进程基本都是-1000，这代表了这些进程的绝对重要性，不能被轻易杀死，而1000则是最容易被杀死的。根据oom_score的计算方式，-1000的 oom_score_adj 的进程计算出的 oom_score 都是0，因此在oom排序中都处在末尾（最不容易被杀死的范围）
## kubelet为Pod设置的oom_score_adj
在Pod被创建时，kubelet会为每个Pod生成 oom_score_adj，具体数值是由QoS决定的：
| QoS        | oom_score_adj 默认 |
| ---------- | ---------------- |
| Guaranteed | -998             |
| Burstable  | 动态计算             |
| BestEffort | 1000             |


其中Burstable Pod的oom_score_adj是通过``requests.memory`` 和 ``node allocatable memory``等参数综合计算出来的
```text
oom_score_adj = 1000 - (1000 * memory_request) / node_allocatable_memory
```
(这个算式只是为Burstable Pod计算oom_score_adj的近似计算逻辑，实际实现中还包含边界限制与特判。)

另外，kubelet自身的oom_score_adj是-999，这意味着kubelet几乎是在所有用户态应用中拥有最高oom优先级的应用，然而当极端情况发生时，kubelet并非不可抛弃，原因很简单：kubelet挂了，节点还有自愈的可能，而节点如果因为内存无法释放导致卡死，几乎无法通过重启以外的方式复原，因为操作窗口（比如ssh）都无法使用，两者的严重程度还是相差很多的。

通过这个oom_score_adj，kubernetes能够确保高价值Pod在系统OOM发生时拥有更高的存活概率，这个设计非常出色。

## VPA 影响 oom_score_adj
VPA 可以在部署时根据实际情况自动修正 requests 的值，使得 Pod 更容易被调度到真正拥有足够资源的节点上，而不是因为其较小 requests 的值被调度到一个资源不充足的节点上，并在资源使用量逐渐提高后被 kubelet 驱逐；

VPA 修改 requests 的值会影响 Pod 在节点宿主机上映射出来的 cgroups oom_score_adj 的值。由于 Burstable Pod 的oom_score_adj 是 0-999，VPA 通过适当修正 requests 的值，可以使 request 与 limits 之间的差距缩小，使 oom_score_adj 的取值区间降低，这会导致当系统级 OOM 发生时，Pod 更晚被 OOM。

:::tip
VPA 不会动态修改运行中 Pod 的 oom_score_adj，仅影响新创建的 Pod 或通过重建生效
:::

# 总结
节点压力驱逐：是kubelet主动发起的、基于kubelet监控数据的Pod删除行为，旨在防止节点崩溃。它是一个相对“温和”、有顺序的清理过程。

内核OOM Killer：是Linux内核在极端压力下（已无可用内存，交换空间也可能用尽）的被动、最后手段。在它的视角中只有进程，而没有kubelet与Pod等上下级关系，只根据内核的oom_score决定杀哪个进程。

cgroups：是两者共同的技术基础。它为kubelet提供了实施资源限制（memory.max）和影响内核OOM决策（通过memory.oom.group和oom_score_adj）的能力。

关系：合理的Pod资源限制（通过cgroups实现）可以降低节点压力驱逐和内核OOM发生的概率。当节点压力出现时，kubelet的驱逐是对内核OOM的一种预防。如果预防失败，内核OOM将根据受cgroups影响的oom_score来接管。

# 英文版
[Avaliable on Dev Community](https://dev.to/chunyi_wang/why-your-kubernetes-pod-was-oom-killed-and-who-really-killed-it-1jab)