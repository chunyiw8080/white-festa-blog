---
title: Kubernetes学习笔记三：Pod的调度策略
published: 2023-12-27
pinned: false
description: Pod的调度策略与节点亲和性
tags: [Kubernetes]
category: 容器
draft: false
---

# 根据 Node 节点选择器进行 Pod 资源调度
## 使用 nodeName 进行资源调度
使用 nodeName 调度 Pod 不会经过 Scheduler

```yaml
spec:
  nodeName: node-02
  containers:
  - name: example-pod
    image: nginx:latest
```

## 使用 nodeSelector 进行资源调度
```yaml
spec:
  containers:
  - name: nginx
    image: nginx
  nodeSelector:
    disktype: ssd 
    gpu: "true" 
    region: east   
```

# Node Affinity 节点亲和性
节点亲和性是 Kubernetes 集群中的资源调度策略，它可以控制 Pod 被调度到哪些节点上。节点亲和性通常用于满足某些应用程序的特殊需求，比如将应用程序的 Pod 调度到同一节点上，以提高应用程序的性能和稳定性。

## 节点亲和性与反亲和性
在 Kubernetes 集群中，节点亲和性由亲和性规则 Affinity Rule 定义，亲和性规则可以指定一组标签，以及 Pod 被调度到节点上时需要匹配的节点标签。亲和性规则通常用于指定 Pod 应该运行在哪些节点上，例如，可以通过指定亲和性规则，将 Pod 调度到只包含特定单元测试的节点上，或将所有 Pod 调度到只拥有强大 CPU 的节点上。

与亲和性相反的是反亲和性 Node Anti-affinity，它指定当 Kubernetes 集群中有多个节点符合调度条件时， 不应将 Pod 调度到某些节点上。例如，可以通过设定反亲和性规则，确保数据库 Pod 被调度到不含其他数据库 Pod 的节点上，提高性能。

[将 Pod 指派给节点](https://kubernetes.io/zh-cn/docs/concepts/scheduling-eviction/assign-pod-node/#node-affinity)

 

## 节点硬亲和性
硬亲和性 是 Kubernetes 中一种强制性的调度策略，用于严格限制 Pod 只能运行在满足特定条件的节点上。如果节点不满足条件，Pod 将不会被调度（处于 `Pending` 状态），直到符合条件的节点可用。硬亲和性会覆盖默认调度器或其他软性规则。

配置示例

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: nginx
spec:
  affinity:
    nodeAffinity:
      requiredDuringSchedulingIgnoredDuringExecution: 
        nodeSelectorTerms:
        - matchExpressions:
          - key: disktype
            operator: In
            values:
            - ssd
  containers:
  - name: nginx
    image: nginx
```

其中 `requiredDuringSchedulingIgnoredDuringExecution` 是硬亲和性的固定字段名，表示“调度时必须满足，运行时忽略”（即调度后节点标签变化不影响已运行的 Pod）

## 节点软亲和性
与硬亲和性相对，软亲和性是 Kubernetes 集群中非强制性的调度策略，Pod 会被优先调度到符合软亲和性规则的节点上，如果没有任何节点满足规则，则随机调度到某个节点上。

软亲和性和硬亲和性可以组合使用，调度器在所有满足硬亲和性规则的节点中寻找最大程度上满足软亲和性规则的节点进行调度。

配置示例：

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: my-pod
spec:
  affinity:
    nodeAffinity:
      # 软亲和性：尽量运行在 zone=us-east-1a 的节点
      preferredDuringSchedulingIgnoredDuringExecution:
      - weight: 100  # 权重（1-100）
        preference:
          matchExpressions:
          - key: zone
            operator: In
            values: [us-east-1a]
  containers:
  - name: nginx
    image: nginx
```

权重值：

权重值（weight）仅用于在多个软性规则间排序，如 weight: 100 比 weight: 50 优先级更高，当多个节点分别满足不同的软亲和性规则时，Pod 会被部署到满足最高权重规则的节点上。

# Pod 亲和性
Pod 亲和性 (Pod Affinity) 是 Kubernetes 集群中的调度策略之一，用于指定一组 Pod 需要被调度到相同的节点上或避免被调度到相同的节点上，以此提高应用程序性能、可靠性和安全性。

与 Node Affinity 类似，Pod 亲和性由 Pod Affinity Rule 定义，亲和性规则可以指定一组标签以及 Pod 被调度到节点上时，需要满足的其他 Pod、节点标签条件。

Pod 亲和性规则有以下典型应用：

1. 避免同一应用程序的 Pod 部署在同一节点上，防止节点宕机导致服务的全部失效
2. 部署 多个关联 Pod 在同一节点上，提高通信效率
3. 提高分布式数据存储系统的可靠性，将数据副本部署在集群的不同节点上

## Pod 硬亲和性
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: with-pod-affinity
spec:
  affinity:
    podAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
      - labelSelector:
          matchExpressions:
          - key: security
            operator: In
            values:
            - S1
        topologyKey: topology.kubernetes.io/zone
```

该配置的含义是：只有节点属于特定的区域 且该区域中的其他 Pod 已打上 `security=S1` 标签时，调度器才可以将示例 Pod 调度到此节点上。 

## Pod 软亲和性
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: with-pod-affinity
spec:
  affinity:
    podAffinity:
      preferredDuringSchedulingIgnoredDuringExecution:
      - weight: 100
        podAffinityTerm:
          labelSelector:
            matchExpressions:
            - key: security
              operator: In
              values:
              - S2
```

## TopologyKey
在 Kubernetes 的 Pod 亲和性（Pod Affinity/Anti-Affinity） 规则中，`topologyKey` 是一个关键字段，用于定义 Pod 之间的“拓扑域”范围，即决定 Pod 应该如何分组或分散调度。

### 核心作用
`topologyKey` 指定了一个 节点标签的键（Label Key），Kubernetes 会根据该标签的值将节点划分为不同的 拓扑域。调度器通过这个域来判断 Pod 是否满足“在同一域”或“不在同一域”的亲和性/反亲和性规则。

### 示例
有以下场景：部署一个应用，该应用有三个副本，三个副本需要分别部署到三个位于不同地区 (australia-central, us-east, europe-central) 的节点上。

方法：

1. 为三个节点打标签，分别是：`topology.kubernetes.io/zone=australia-central-1`, `topology.kubernetes.io/zone=us-east-1` 以及 `topology.kubernetes.io/zone=europe-central-1`

```bash
kubectl label nodes node1 topology.kubernetes.io/zone=australia-central-1
kubectl label nodes node2 topology.kubernetes.io/zone=us-east-1
kubectl label nodes node3 topology.kubernetes.io/zone=europe-central-1
```

2. 编写资源定义文件，使用 podAntiAffinity 让三个 Pod 根据地区差异部署在不同的节点上

```yaml
podAntiAffinity:
  requiredDuringSchedulingIgnoredDuringExecution:  # 硬反亲和性
    - labelSelector:
        matchExpressions:
          - key: app
            operator: In
            values: [my-app]
      topologyKey: topology.kubernetes.io/zone  # 按可用区分散
```

### 拓扑域的范围
Kubernetes 标签判定节点是否在同一个拓扑域。例如，节点 1 和节点 2 都拥有标签 `topology.kubernetes.io/performance=high`，因此这两个节点被视为处在同一个拓扑域，当使用反亲和性规则以 `topology.kubernetes.io/performance=high` 标签作为拓扑域的判定规则时，只有一个 Pod 会被部署到这两个节点中的一个上。

### 为什么推荐使用 topology.kubernetes.io 前缀？
在 Kubernetes 中，`topology.kubernetes.io` 前缀并非严格必需，但它是官方推荐的标签命名规范，尤其是在涉及拓扑感知调度（如 Pod 亲和性、反亲和性）时。

### 情景
有一个mysql pod和一个 web pod，如何确保mysql 永远与web pod处在同一节点上

1. 部署 MySQL Pod

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: mysql
  labels:
    app: mysql  # 用于 Web Pod 的亲和性匹配
spec:
  containers:
  - name: mysql
    image: mysql:5.7
    env:
    - name: MYSQL_ROOT_PASSWORD
      value: "password"
```

2. 部署 Web Pod

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: web
spec:
  affinity:
    podAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:  # 硬亲和性
      - labelSelector:
          matchExpressions:
          - key: app
            operator: In
            values: [mysql]  # 匹配 MySQL Pod 的标签
        topologyKey: kubernetes.io/hostname  # 必须在同一节点
  containers:
  - name: web
    image: nginx
```

# Operator
| Operator |  功能  |  是否需要 values |  示例  |
| --- | --- | --- | --- |
| `In` | 标签值在列表中 | 是（至少一个值） | 选择 `app=web` 或 `app=api` |
| `NotIn` | 标签值不在列表中 | 是 | 排除 `env=test` 或 `env=dev` |
| `Exists` | 标签键存在（不检查值） | 否 | 选择所有 GPU 节点 |
| `DoesNotExists` | 标签键不存在 | 否 | 排除维护中的节点 |
| `Gt`/`Lt` | 标签值大于/小于指定数值 | 是（仅一个数值字符串） | 选择高优先级（`priority>50`） |


# Pod 污点和容忍
## 什么是污点和容忍
在 kubernetes 中，Pod 污点 (Taint)是一个标记，表示一个 Node 具有一些特殊的或者不可接受的特征，例如某些基础设施故障或者一些不允许部署的资源。Pod 容忍 (Toleration) 是指一个 Pod 在调度时可以接受 Node 上存在的一些污点，从而将其调度到该节点上运行。

常见场景：

1. 节点维护：在节点需要进行维护时，可以使用污点的方式将节点标记为不可调度状态，这样新的 Pod 就不会被调度到该节点上；同时，有污点的节点可以继续运行已在运行状态的 Pod。
2. Pod 需要特定资源：比如某些需要使用 GPU 的应用，使用污点标记没有 GPU 的节点，防止 Pod 被调度到这些不满足条件的节点上。
3. 安全风险：当部分节点面临外部安全威胁时，可以使用污点标记这些节点，防止 Pod 部署到这些有隐患的节点上。
4. 资源分配：当某个节点可用资源不足时，使用污点标记节点防止 Pod 被调度到这些节点上；同时，还可以使用容忍来声明某些特定的 Pod 可以被调度到这些节点上。

## 使用方法
### 污点
1. `NoSchedule`：仅影响调度过程，如果新部署的 Pod 能够容忍此污点，也可以部署到此节点上；不影响已存在的 Pod。
2. `PreferNoSchedule`：仅当没有其他可用节点时，Pod 才会被调度到此节点上。
3. `NoExecute`：既影响调度过程，也影响现存的 Pod，现存的不能容忍此污点的 Pod 会被全部驱逐。

### 容忍
|  字段名称  |  值类型  |  说明  |
| --- | --- | --- |
| `toleration` | <[]object> | 污点容忍 |
| `tolerations.effect` | <string> | 要匹配的污点效果，为空时匹配所有，可指定的值为 `NoSchedule`, `PreferNoSchedule`, `NoExecute` |
| `tolerations.key` | <string> | 匹配污点的 key，key 若为空则运算符必须为 Exists，表示匹配所有的值和键 |
| `tolerations.operator` | <string> | 表示键与值的关系，`Exists` 无需指定 value，`Equal `污点必须和 value 相等才能匹配 |
| `tolerations.tolerationSeconds` | <integer> | 表示容忍的时间段 |
| `tolerations.values` | <string> | 与容忍度匹配的污点值 |


### 使用
1. 为节点打上污点

```bash
kubectl taint nodes k8s-node-112 type=production:NoSchedule
```

此时再应用资源清单文件，如果没有可用的节点，Pod 状态会变为 `Pending`，原因是 `FailedShceduling`

2. 删除污点 

```bash
kubectl taint nodes k8s-node-112 type=production:NoSchedule-
```

3. 创建一个 Pod，可以容忍 `type=production:NoSchedule` 污点

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: nginx
  namespace: default
  labels:
    app: nginx
spec:
  containers:
  - name: nginx
    image: nginx:latest
  tolerations:
  - key: "type"
    operator: "Equal"
    value: "production"
    effect: "NoSchedule"

```

# 拓扑分布约束
拓扑分布约束（Topology Spread Constraints）可以用来控制 [Pod](https://kubernetes.io/zh-cn/docs/concepts/workloads/pods/) 在集群内故障域之间的分布， 例如区域（Region）、可用区（Zone）、节点和其他用户自定义拓扑域。 这样做有助于实现高可用并提升资源利用率。

## 示例
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: example-pod
spec:
  # 配置一个拓扑分布约束
  topologySpreadConstraints:
    - maxSkew: <integer>
      minDomains: <integer> # 可选
      topologyKey: <string>
      whenUnsatisfiable: <string>
      labelSelector: <object>
```

## 字段
1. `maxSkew`：定义了允许的 Pod 数量在不同拓扑域之间的最大差异，是控制分布均匀性的核心参数。该数值表示表示在任何两个拓扑域之间，Pod 数量的最大允许差值，值越小，分布越均匀；值越大，允许的不均衡程度越高，设置为 1 表示追求完全均匀分布。例如，如果有 3 个 zone 和 5 个 Pod，当 maxSkew 为 1 时，可能的分布是 2-2-1，当 maxSkew 为 2 时，可能的分布是 3-1-1。
2. `minDomains`：定义了调度时应考虑的最小拓扑域数量，用于处理集群动态变化时的调度行为，只有满足指定数量的拓扑域可用时，才会进行调度。
3. `whenUnsatisfiable`：定义了当调度器无法满足分布约束时应采取的行为，有两个可选值
    1. `DoNotSchedule` - 默认值，严格模式，不满足条件则不调度
    2. `ScheduleAnyway` - 宽松模式，尽量满足但允许不完美调度
4. `matchLabels`：定义了计算基准，根据 pod 标签来计算某个标签的 pod 是否需要被计算到拓扑域 Pod 分配中，例如：

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-server
spec:
  replicas: 10
  selector:           # 必须添加selector匹配template的labels
    matchLabels:
      app: web-server
  template:
    metadata:
      labels:
        app: web-server
        version: dev
    spec:
      # 配置一个拓扑分布约束
      topologySpreadConstraints:
      - maxSkew: 1
        minDomains: 5
        topologyKey: topology.kubernetes.io/zone
        whenUnsatisfiable: DoNotSchedule
        labelSelector: 
          matchExpressions:
          - key: app
            operator: In
            values: [web-server, test-web-server]
      containers:
      - name: web-server
        image: nginx:latest
```

在这个配置中，10 个 Pod 副本将被部署到至少 5 个拓扑域上，但是`labelSelector` 中指定了将两个标签假如到计算基准中，该配置声明了 Pod 在不同域中的最大差值为 1，假如在可用的拓扑域中有 1 个已存在的，标签为 `app: test-web-server`的 Pod，则最终 Scheduler 需要计算如何在 5 个域中保持 11 个 Pod 均匀分布，且任意两个域中 Pod 的最大差值小于等于 1。

# Pod 优先级和抢占式调度
Pod 优先级是一个整数值，代表该 Pod 的相对重要性。Kubernetes 使用它来决定在资源紧张时哪个 Pod 更应该被保留或被调度。

## Pod 优先级的作用
### 抢占
当没有足够的资源调度一个高优先级 Pod 时，Kubernetes 可以主动抢占并驱逐低优先级的 Pod，以为高优先级 Pod 腾出资源。

+ 高优先级 Pod 进入 Pending 状态，等待资源。
+ 调度器尝试调度，但找不到资源充足的节点。
+ 调度器查找是否可以通过抢占较低优先级的 Pod来释放资源。
+ 如果可以：
    - 标记被抢占的 Pod 为 Terminating 状态；
    - 一段时间后强制删除（有 grace period）；
    - 高优先级 Pod 被成功调度。

### 调度排序（优先调度）
在多个 Pod 等待资源时，当有足够的可用资源出现，调度器会优先调度优先级更高的资源

### 调度逻辑
> 情景：  
假如当前有两个 Pod 正在等待资源，Pod 1 优先级50，需要50M的启动内存，Pod 2优先级100，需要100M的启动内存，两个Pod的抢占策略都是 Never，此时当节点突然释放了一个 Pod，拥有 70M 的空闲内存，那么调度器会先将 Pod 1 调度到节点上，还是会继续等待资源直到有 100M 内存并调度 Pod 2？  
>

答案是：调度器会调度 Pod 1，不会等待 Pod 2

1. 调度器不会为了高优先级 Pod 而“跳过调度低优先级 Pod”，除非该高优先级 Pod 被配置为可以抢占（`PreemptLowerPriority`）别人。
2. 调度器的行为逻辑大致是这样的：
    1. 先按优先级排序 Pending Pods（值越高越先考虑）；
    2. 逐个尝试调度；
    3. 遇到资源不够的 Pod → 跳过，继续看下一个；
    4. 如果某个低优先级 Pod 能调度上，就会立刻调度它，而不是“等待资源”。

## 使用
Pod 优先级由 `PriorityClass` 资源创建，然后赋值给 Pod

### 字段介绍
|  字段  |  类型  |  说明  |
| --- | --- | --- |
| apiVersion | string | `scheduling.k8s.io/v1` |
| description | string | 描述信息 |
| globalDefault | boolean | 是否将优先级应用至所有未指定`PriorityClass` 的 Pod 资源 |
| preemptionPolicy | string | 抢占策略：`Never` - 从不抢占；`PreemptLowerPriority` - 抢占较低优先级 |
| value | integer | 优先级，数字约大，优先级越高，超过 1 亿的数字被系统保留，用于指派给系统组件 Pod |


### 创建优先级资源
```yaml
---
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: default-priority
value: 0
globalDefault: true # 将所有Pod的默认优先级设置为0
description: "This is the default priority class"
---
---
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: high-priority
value: 100
globalDefault: false # 声明一个优先级，值为100，该优先级只能在资源清单文件中显示调用
description: "This is the high priority class"
---
```

### 为 Pod 应用优先级
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: nginx-high-priority
spec:
  priorityClassName: high-priority
  preemptionPolicy: PreemptLowerPriority # 声明抢占式调度，允许该Pod抢占低优先级Pod的资源
  containers:
  - name: nginx
    image: nginx:latest
    resources:
      requests:
        cpu: "300m"
        memory: "50Mi"
```

