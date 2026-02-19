---
title: Kubernetes学习笔记七：DaemonSet控制器
published: 2024-05-07
pinned: false
description: 使用DaemonSet确保在集群中的每个节点都运行一个特定Pod，该Pod可以用于执行某些特定任务。
tags: [Kubernetes]
category: 容器
draft: false
---

# 概述
DeamonSet 控制器用于确保在集群中的每个节点上运行一个 Pod 的副本，并且该副本可以执行一些特定任务，如监控、日志收集、节点维护等。

与 Deployment 不同，DaemonSet 不指定副本数，而是固定地在每个节点上运行一个 Pod，当新的节点加入到集群时，DaemonSet 也会自动地在新节点上运行一个 Pod，当节点从集群中移除时，对应的 Pod 也会被自动移除。

DaemonSet 控制器通常用于部署一些系统级别的服务或应用程序，比如 `fluentd`、`kube-proxy` 和 `Node Exporter`。

# 典型应用
1. 日志收集  
在每个节点上部署日志采集器（如 `Fluentd`、`Filebeat`、`Logstash`），将节点本地的容器日志收集并转发到集中式系统（如 `Elasticsearch`、`Kafka`）。这种方式可以确保无论在哪个节点上运行的 Pod，其日志都能被采集到。
2. 系统和节点指标监控  
在每个节点上运行指标采集工具（如 `Prometheus Node Exporter`、`Datadog Agent`、`Telegraf`），收集 CPU、内存、磁盘、网络等系统级别的性能数据，并发送给监控平台。是 `Prometheus/Grafana` 类监控系统的基础设施部分。
3. 网络插件组件  
很多容器网络接口（`CNI`）插件（如 `Calico`、`Cilium`、`Flannel`）都使用 DaemonSet 部署一个网络代理或管理组件到每个节点，用于配置虚拟网络、设置路由规则或执行网络策略。
4. 安全监控和审计  
运行安全代理（如 `Falco`、`Sysdig`、`OSSEC`）来实时监控节点和容器的系统调用行为、进程操作、文件访问、网络连接等，帮助检测入侵或异常行为。
5. 存储驱动和设备插件  
在支持特定硬件（如 GPU、NVMe）的节点上，通过 DaemonSet 部署驱动插件或资源管理器（如 `NVIDIA device plugin`），以实现资源调度和隔离。
6. 容器运行时工具  
部署如 `Kata Containers`、`gVisor` 等沙箱运行时工具的代理进程，增强容器隔离和安全性。这些进程需要以守护进程形式存在于每个目标节点上。
7. 镜像预拉取器（pre-puller）  
在集群更新前，使用 DaemonSet 拉取某些大镜像到所有节点，以加快后续服务启动速度，防止因为镜像未缓存导致的部署延迟。
8. 节点清理器或资源回收工具  
运行磁盘清理、旧日志删除、volume 清理等工具，以确保节点不会因残留文件占用过多空间而影响稳定性。
9. 自定义节点初始化器或助手进程  
某些系统或业务需要在节点上运行自定义的初始化进程、配置工具或维护脚本，DaemonSet 能确保这些工具在所有节点上以一致方式运行。
10. 容器调试工具  
在每个节点上部署调试容器（如 `netshoot`、`debug-agent`），便于你用 `kubectl exec` 进入一个能执行 `ping`, `curl`, `tcpdump`, `dig` 等命令的工具容器，帮助排查网络、存储、DNS 等底层问题。

# DaemonSet 可用配置
| 字段路径 | 类型 | 说明 |
| --- | --- | --- |
| `spec.template.spec` | object | Pod 的详细定义，包含容器、挂载、网络等 |
| `spec.updateStrategy` | object | 更新策略配置 |
| `spec.updateStrategy.type` | string | 更新类型：`RollingUpdate`（默认）或 `OnDelete` |
| `spec.updateStrategy.rollingUpdate.maxUnavailable` | int/string | 滚动更新时，允许同时不可用的 Pod 数（可为绝对值或百分比） |
| `spec.minReadySeconds` | integer | Pod 在被认为“ready”前需保持 Ready 状态的秒数 |
| `spec.revisionHistoryLimit` | integer | 保留的历史版本数，用于支持回滚（默认是 10） |
| `spec.template.spec.containers` | list | 定义要运行的容器 |
| `spec.template.spec.volumes` | list | 定义 Pod 使用的卷（如 ConfigMap、HostPath） |
| `spec.template.spec.nodeSelector` | map | 节点选择器，用于指定 Pod 运行在哪些节点上 |
| `spec.template.spec.affinity` | object | 节点或 Pod 亲和性规则 |
| `spec.template.spec.tolerations` | list | 容忍某些污点的配置，允许部署到打了 Taint 的节点上 |
| `spec.template.spec.hostNetwork` | boolean | 是否使用主机网络（true 表示共享节点的网络） |
| `spec.template.spec.dnsPolicy` | string | DNS 策略，常见值：`ClusterFirst`, `Default`, `None` |
| `spec.template.spec.securityContext` | object | Pod 级别的安全上下文配置 |
| `spec.template.spec.terminationGracePeriodSeconds` | integer | 终止前的优雅关闭等待时间（秒） |


# 示例：使用 Daemonset 部署 Fluentd 收集节点的日志信息
```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: fluentd
  namespace: kube-system
spec:
  selector:
    matchLabels:
      app: fluentd
  template:
    metadata:
      labels:
        app: fluentd
    spec:
      tolerations:
        # 容忍 master 节点的 NoSchedule 污点
        - key: "node-role.kubernetes.io/master"
          operator: "Exists"
          effect: "NoSchedule"
      containers:
        - name: fluentd
          image: fluent/fluentd:v1.14.2
          resources:
            requests:
              memory: "200Mi"
              cpu: "100m"
            limits:
              memory: "500Mi"
              cpu: "500m"
          # 在Fluentd容器内挂载宿主机的日志目录路径
          volumeMounts: 
            - name: varlog
              mountPath: /var/log
            - name: varlibdockercontainers
              mountPath: /var/lib/docker/containers
              readOnly: true
      volumes:
        - name: varlog
          hostPath:
            path: /var/log
        - name: varlibdockercontainers
          hostPath:
            path: /var/lib/docker/containers
      serviceAccountName: fluentd
```

