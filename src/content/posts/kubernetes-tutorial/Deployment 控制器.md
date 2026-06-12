---
title: Kubernetes学习笔记五：Deployment控制器
published: 2024-02-25
pinned: false
description: 使用Deployment 为 Pod 和 ReplicaSet 提供声明式的更新能力。
tags: [Kubernetes]
category: 容器
draft: false
---

Deployment 为 Pod 和 ReplicaSet 提供声明式的更新能力。

#  Deployment 的典型用例
1. 创建 Deployment 以将 ReplicaSet 上线。ReplicaSet 在后台创建 Pod。 检查 ReplicaSet 的上线状态，查看其是否成功。
2. 通过更新 Deployment 的 PodTemplateSpec，声明 Pod 的新状态。新的 ReplicaSet 会被创建，Deployment 以受控速率将 Pod 从旧 ReplicaSet 迁移到新 ReplicaSet。
3. 如果 Deployment 的当前状态不稳定，可以回滚到较早的 Deployment 版本。
4. 扩大 Deployment 规模 (提高副本数量) 以承担更多负载。
5. 清理较旧的不再需要的 ReplicaSet

#  Deployment 的可用字段
| 字段路径 | 类型 | 说明 |
| --- | --- | --- |
| `spec.replicas` | `int32` | 期望的 Pod 副本数，默认是 1。 |
| `spec.template` | `PodTemplateSpec` | 定义 Pod 模板，包括容器、卷、环境变量等配置。 |
| `spec.strategy.type` | `string` | 更新策略类型：`RollingUpdate`（默认）或 `Recreate`。 |
| `spec.strategy.rollingUpdate.maxUnavailable` | `int` 或 `string` | 滚动更新中允许同时不可用的 Pod 数量，可用绝对值或百分比（如 `"25%"`）。 |
| `spec.strategy.rollingUpdate.maxSurge` | `int` 或 `string` | 滚动更新中允许的最大额外 Pod 数量，可用绝对值或百分比（如 `"25%"`）。 |
| `spec.minReadySeconds` | `int32` | Pod 就绪后最少保持就绪状态的时间（秒）再计为“可用”，默认是 0。 |
| `spec.revisionHistoryLimit` | `int32` | 保留的旧 ReplicaSet 的数量，默认是 10。超过将自动清理旧的。 |
| `spec.paused` | `bool` | 如果为 true，则暂停 Deployment 的滚动更新。 |
| `spec.progressDeadlineSeconds` | `int32` | Deployment 最长更新时间（秒），超时将被标记为失败，默认是 600。 |


#  Depolyment 滚动更新与版本回退
1. 滚动更新允许通过使用新的实例逐步更新 Pod 实例，实现零停机的 Deployment 更新。 新的 Pod 将被调度到具有可用资源的节点上。
2. 与应用程序规模扩缩类似，如果 Deployment 的访问是公开的，Service 在更新期间仅将流量负载均衡到可用的 Pod。可用的 Pod 是指对应用的用户可用的实例。
3. 滚动更新允许以下操作：
    1. 将应用程序从一个环境升级到另一个环境（通过容器镜像更新）
    2. 回滚到以前的版本
    3. 持续集成和持续交付应用程序，无需停机
4. 示例

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: rolling-update-demo
  labels:
    app: demo
spec:
  replicas: 4
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 0      # 在滚动更新过程中，所有旧的 Pod 必须保持可用，不能有任何不可用的 Pod。
      maxSurge: 1            # 最多允许比 replicas 多 1 个 Pod（用于部署中的临时超额）
  revisionHistoryLimit: 5     # 保留最近 5 个历史版本
  progressDeadlineSeconds: 300  # 更新超时时间（秒），超过将被标记为失败
  minReadySeconds: 5         # 新 Pod 就绪后至少保持 5 秒才算“可用”
  selector:
    matchLabels:
      app: demo
  template:
    metadata:
      labels:
        app: demo
    spec:
      containers:
        - name: nginx
          image: nginx:1.21
          ports:
            - containerPort: 80
```

5. 版本回退
    1. 查看历史版本

```bash
kubectl rollout history deployment DEPLOYMENT_NAME
```

输出类似于

```txt
deployment.apps/rolling-update-demo 
REVISION  CHANGE-CAUSE
1         <none>
2         kubectl apply --filename=...
```

    2. 回退到指定版本

```bash
kubectl rollout undo deployment rolling-update-demo --to-revision=1
```

