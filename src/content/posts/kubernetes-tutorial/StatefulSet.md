---
title: Kubernetes学习笔记十：Kubernetes StatefulSet控制器
published: 2024-07-15
pinned: false
description: 使用StatefulSet控制器管理部署在Kubernetes中的有状态应用
tags: [Kubernetes]
category: 容器
draft: false
---

# 定义
StatefulSet 是Kubernetes 中的一种控制器，用于管理有状态应用程序的部署。

相比于Deployment 控制器，StatefulSet 控制器允许<u>有序</u>且<u>唯一</u>的命名，每个Pod 可以绑定到不同的持久卷，有序的进行启动和停止，以及有序的进行水平扩展和缩小。这使得StatefulSet 控制器适合运行<u>有状态</u>应用程序，如数据库、缓存和消息队列等应用。

## StatefulSet 组成
1. 控制器（Controller）：控制和管理运行StatefulSet 的Pod。
2. 持久存储（Persistent Storage）：StatefulSet 控制器使用持久卷将数据保存在存储节点。
3. Headless Service：用来定义pod 网路标识，生成可解析的DNS 记录

## 什么是Headless service?
Headless Service <u>没有固定的Cluster IP 地址</u>，而是直接<u>返回Pod 的DNS名称列表</u>。这种服务方式称为`headless`，因为它不会负责监听对应的DNS名称，也不存在虚拟IP 地址，所有的访问请求都会直接转发到Pod 上。这个功能非常适合于对于需要访问特定的Pod 的应用程序，例如一些分布式系统。

Headless Service 与普通Service 的最大区别在于，它返回的不是一个Cluster IP，而是一个DNS 名称列表。使用Headless Service 时，需要<u>设置Service 的clusterIP 字段为空</u>，在Service 的`spec `字段中设置`clusterIP: None`。通过这种方式创建的Headless Service，会在DNS 服务器中注册一个域名，用来识别Service 名称。对于每个Service 名称，Kubernetes 将自动生成一个与它匹配的域名，形式为：`my-service.my-namespace.svc.cluster.local`，其中，`my-service` 是 Headless Service 的名称，`my-namespace` 是Headless Service 所处的命名空间。

StatefulSet 会为关联的Pod 分配一个dnsName：

`$<Pod Name>.$<service name>.$<namespace name>.svc.cluster.local`

总之，Headless Service 是一种用于访问Kubernetes 集群内部的Pod 的服务方式，适用于需要遍历整个Pod 列表的应用程序，同时避免使用Cluster IP的场景。

# StatefulSet 资源定义
| 字段名 | 类型 | 说明 | 是否必填 | 备注 |
| --- | --- | --- | --- | --- |
| `apiVersion` | string | apps/v1 | 是 |  |
| `replicas` | integer | 副本数，指定 StatefulSet 需要运行的 Pod 数量 | 否 | 默认值为 1 |
| `serviceName` | string | 与 StatefulSet 关联的 Headless Service 名称，用于稳定网络标识和 DNS 解析 | 是 | 必须是已有的 Headless Service 名称 |
| `selector` | LabelSelector | Pod 标签选择器，用于匹配 StatefulSet 管理的 Pod | 是 | 必须与 `template.metadata.labels` 匹配 |
| `template` | PodTemplateSpec | Pod 模板，定义 StatefulSet 中各 Pod 的详细规格 | 是 | 包含 Pod 的 metadata 和 spec |
| `volumeClaimTemplates` | []PersistentVolumeClaim | PVC 模板列表，为每个 Pod 动态创建持久卷声明 | 否 | 常用于有状态应用的持久存储（该字段为每个 Pod 创建 PVC，如果在配置文件中创建一个独立的 PVC 并绑定，实际上上多个 Pod 共享一个 PVC） |
| `updateStrategy` | StatefulSetUpdateStrategy | 更新策略，控制 StatefulSet 更新方式 | 否 | 默认为 `RollingUpdate`，有一个可用字段 `partition` 指定从哪个副本开始滚动更新（0-based索引）   ，可选 `OnDelete` |
| `podManagementPolicy` | string | Pod 管理策略，控制 Pod 创建和删除的顺序 | 否 | 可选 `OrderedReady`（默认）或 `Parallel` |
| `revisionHistoryLimit` | integer | 保留旧版本的数量 | 否 | 默认为 10 |
| `minReadySeconds` | integer | Pod 准备就绪状态需持续的最短时间（秒），用于提升服务稳定性 | 否 | 默认 0 |
| `ordinals` |  object   |  定义 StatefulSet Pod 的序号范围，包含 `start` 和 `end` 两个整数   |  否   |  用于指定 Pod 序号区间（闭区间）   |
| `ordinals.start  ` |  integer   |  Pod 序号起始值（包含该值）   | 否   |  默认为 0   |
| `ordinals.end  ` |  integer   |  Pod 序号结束值（包含该值）   | 否   |  默认为 `replicas-1`，不超过副本数范围   |
|  `serviceName  ` |  string   |  关联的 **Headless Service** 名称，用于 StatefulSet Pod 的稳定网络标识和 DNS（如 `web-0.web.default.svc.cluster.local`）   |  是   |  |
|  `podManagementPolicy  ` |  string   |  控制 Pod 的创建和删除顺序方式。 | 否   | 可选值：   • `OrderedReady`: 顺序创建和删除（默认）   • `Parallel`: 并行创建和删除   |
| `persistentVolumeClaimRetentionPolicy  ` |  string   |  控制 StatefulSet 被删除或缩容时，Pod 对应的 PVC 是否保留或删除。 | 否   | 包括两个子字段：`whenDeleted` 和 `whenScaled`。需要 Kubernetes **v1.25+** |


# 示例
使用 StatefulSet 部署 Web 站点并使用 nfs-provisioner 创建持久化存储

```yaml
# Service网络入口
apiVersion: v1
kind: Service
metadata:
  name: nginx
  labels:
    app: nginx
spec:
  ports:
  - name: web
    port: 80
    targetPort: web
  clusterIP: None
  selector:
    app: nginx
---
# 创建StatefulSet
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: web
spec:
  selector:
    matchLabels:
      app: nginx
  serviceName: "nginx" # 选择之前创建的service作为网络入口
  replicas: 2 # 2个副本
  updateStrategy:
    type: RollingUpdate
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
      - name: nginx
        image: nginx:latest
        ports:
        - containerPort: 80
          name: web
        volumeMounts:
        - name: www # 使用下面声明的PVC
          mountPath: /usr/share/nginx/html # 挂载点
  volumeClaimTemplates:
  - metadata:
      name: www # PVC的名称
    spec:
      accessModes: ["ReadWriteOnce"] # 允许单节点读写
      storageClassName: "nfs-storage" # 使用先前创建的nfs-storage存储类自动为Pod请求存储卷
      resources:
        requests:
          storage: 500Mi # 请求500M大小的存储卷
```

# StatefulSet 的回滚和更新
1. 更新镜像

```yaml
    spec:
      containers:
      - name: nginx
        image: tomcat:latest
        ports:
        - containerPort: 80
          name: web
        volumeMounts:
        - name: www # 使用下面声明的PVC
          mountPath: /usr/share/nginx/html # 挂载点
```

2. 应用资源清单文件
3. 查看 StatefulSet

```bash
[root@microk8s-85 /opt/tutorial/statefulset]#kubectl get statefulset -o wide
NAME   READY   AGE   CONTAINERS   IMAGES
web    2/2     33m   nginx        tomcat:latest
```

4. 获取 StatefulSet 的历史版本

```bash
[root@microk8s-85 /opt/tutorial/statefulset]#kubectl rollout history statefulset web
statefulset.apps/web 
REVISION  CHANGE-CAUSE
1         <none> # 第一个版本
2         <none> # 当前版本
```

5. 回退

```bash
[root@microk8s-85 /opt/tutorial/statefulset]#kubectl rollout undo statefulset web --to-revision=1
statefulset.apps/web rolled back
```

6. 修改资源清单文件，将镜像改回成 `nginx:latest`

