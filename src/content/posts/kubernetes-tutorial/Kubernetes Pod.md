---
title: Kubernetes学习笔记二：Kubernetes Pods
published: 2023-10-22
pinned: false
description: Kubernetes Pod概念，Sidecar、Init和Pause容器的概念和使用以及Pod的几种状态
tags: [Kubernetes]
category: 容器
draft: false
---

# Pod 的组成
## 主应用容器/业务容器 
运行应用程序的主要容器

## 边车容器(Sidecar) 
与主应用容器在同一个 Pod 中运行的辅助容器。 这些容器通过提供额外的服务或功能（如日志记录、监控、安全性或数据同步）来增强或扩展主应用容器的功能， 而无需直接修改主应用代码。

## Init 容器 
Init 容器是一种特殊容器，在 Pod 内的应用容器启动之前运行。Init 容器可以包括一些应用镜像中不存在的实用工具和安装脚本。

初始化容器可以有 1 个或多个，多个容器依照资源清单文件中的定义串行执行。

Init 容器与普通的容器非常像，除了如下两点：

+ 它们总是运行到完成。
+ 每个都必须在下一个启动之前成功完成。

如果 Pod 的 Init 容器失败，kubelet 会不断地重启该 Init 容器直到该容器成功为止。 然而，如果 Pod 对应的 restartPolicy 值为 "Never"，并且 Pod 的 Init 容器失败， 则 Kubernetes 会将整个 Pod 状态设置为失败。

### Init 容器的使用场景
1. 文件下载：下载需要在主容器中使用的配置文件等
2. 数据填充：在主容器启动之前填充数据，如数据库初始化
3. 网络设置：完成一些必要的网络配置
4. 等待依赖项：等待其他服务或资源准备就绪，以便主容器启动
5. 运行脚本或命令：在主容器启动前执行初始化脚本或命令

### 使用 Init 容器
因为 Init 容器具有与应用容器分离的单独镜像，其启动相关代码具有如下优势：

+ Init 容器可以包含一些安装过程中应用容器中不存在的实用工具或个性化代码。 例如，没有必要仅为了在安装过程中使用类似 sed、awk、python 或 dig 这样的工具而去 FROM 一个镜像来生成一个新的镜像。
+ 应用镜像的创建者和部署者可以各自独立工作，而没有必要联合构建一个单独的应用镜像。
+ 与同一 Pod 中的多个应用容器相比，Init 容器能以不同的文件系统视图运行。因此，Init 容器可以被赋予访问应用容器不能访问的 Secret 的权限。
+ 由于 Init 容器必须在应用容器启动之前运行完成，因此 Init 容器提供了一种机制来阻塞或延迟应用容器的启动，直到满足了一组先决条件。 一旦前置条件满足，Pod 内的所有的应用容器会并行启动。
+ Init 容器可以安全地运行实用程序或自定义代码，而在其他方式下运行这些实用程序或自定义代码可能会降低应用容器镜像的安全性。 通过将不必要的工具分开，你可以限制应用容器镜像的被攻击范围。

### 实战
1. 确保仅当 harbor 镜像注册表可用时才启动主容器，如果 harbor 在 5 分钟后仍不可用，自动终止 deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app-wait-for-harbor
spec:
  replicas: 5
  selector:
    matchLabels:
      app: wait-harbor
  template:
    metadata:
      labels:
        app: wait-harbor
    spec:
      initContainers:
        - name: wait-for-harbor
          image: curlimages/curl:7.88.1
          command:
            - sh
            - -c
            - |
              echo "Waiting for Harbor to be available..."
              COUNT=0
              while true; do
                if curl -k -s --head "$HARBOR_URL" | grep "200 OK" > /dev/null; then
                  echo "Harbor is available!"
                  break
                fi
                COUNT=$((COUNT + 1))
                echo "Attempt $COUNT/$MAX_RETRIES failed. Waiting $RETRY_INTERVAL seconds..."
                if [ "$COUNT" -ge "$MAX_RETRIES" ]; then
                  echo "Harbor not available after $MAX_RETRIES attempts. Exiting."
                  exit 1
                fi
                sleep "$RETRY_INTERVAL"
              done
          env:
            - name: HARBOR_URL
              value: "https://harbor.example.com"
            - name: RETRY_INTERVAL
              value: "5"
            - name: MAX_RETRIES
              value: "60"
      containers:
        - name: main-app
          image: nginx:alpine
          ports:
            - containerPort: 80
      restartPolicy: Always
```

2. 从网络上下载 html 文件，并将其设置为主容器 nginx 服务的首页文件

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: setup-nginx-homepage
spec:
  replicas: 5
  selector:
    matchLabels:
      app: nginx-homepage
  template:
    metadata:
      labels:
        app: nginx-homepage
    spec:
      initContainers:
        - name: download-webpage
          image: busybox:1.35.0
          command:
            - sh
            - -c
            - |
              wget -O /web/index.html $WEB_URL || (echo "Download failed" && exit 1)
          env:
            - name: WEB_URL
              value: "https://example.com"
          volumeMounts:
          - name: web
            mountPath: /web
      containers:
        - name: main-app
          image: nginx
          ports:
            - containerPort: 80
          volumeMounts:
          - name: web
            mountPath: /usr/share/nginx/html
      volumes:
      - name: web
        emptyDir: {}
```

## Pause 容器
在 Kubernetes 中，pause 容器 是一个特殊的容器，它在每个 Pod 中隐形存在，是 Pod 所有其他容器的"父容器"（或称为"基础设施容器"）。它的作用是为 Pod 提供共享的 Linux 命名空间，是 Kubernetes 实现 Pod 资源隔离的核心机制。

### pause 容器的核心作用
+ 提供共享的命名空间
    - 网络命名空间：Pod 内所有容器共享同一个 IP 和端口空间（通过 pause 容器实现）。
    - PID 命名空间：容器间可以看到彼此的进程（默认关闭，需配置 shareProcessNamespace: true）。
    - IPC 命名空间：允许容器通过 System V IPC 或 POSIX 消息队列通信
+ 充当"PID 1"进程 - pause 容器是 Pod 内第一个启动的进程（PID 1），负责回收僵尸进程（避免主容器进程成为 PID 1）。
+ 维持 Pod 的生命周期 - 即使 Pod 内所有业务容器退出，pause 容器仍会运行，直到 Pod 被删除，确保 Kubernetes 能正确跟踪 Pod 状态。

### 为什么需要 pause 容器？
Linux 中，命名空间（network/pid/ipc 等）需要由一个进程持有。如果直接启动业务容器：

+ 若第一个业务容器崩溃，Pod 的网络/IP 等命名空间会随之销毁，影响其他容器。
+ 缺乏稳定的父进程管理僵尸进程。

# Pod 资源限制
## Requests 和 Limits
+ Requests 确保 Pod 有足够资源来启动和维持运行，Limits 确保 Pod 不是无限制的使用资源；
+ Limits 声明的资源值可以大于 Requests 但不可以小于；
+ 可以设定的资源类型包括 CPU 与内存
    - CPU 配额达到 Limits 设定的上限时，Pod 无法获取更多的 CPU 资源，但 Pod 扔可以运行
    - 内存配额达到 Limits 设定的上限时，Pod 中的 container 进程会被内核以 OOM 的原因强制终止，之后 kubelet 会重启或重新创建 Pod

## 使用方法
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  labels:
    app: ecommerce
  name: ecommerce-super-pets
spec:
  replicas: 3
  selector:
    matchLabels:
      app: ecommerce 
  template:
    metadata:
      labels:
        app: ecommerce
    spec:
      containers:
      - image: localhost:32000/node-web:3
        name: ecommerce
        ports:
        - name: http
          containerPort: 8080
        resources:
          requests:
            cpu: 50m
            memory: 50Mi
          limits:
            cpu: 50m
            memory: 50Mi
```

# 常见 Pod 状态


![画板](https://cdn.nlark.com/yuque/0/2025/jpeg/56115187/1748753009575-e24751f7-2a82-437f-a4f4-9e27acd7065c.jpeg)

Pod 的 status 定义在 PodStatus 对象中，其中有一个 phase 字段，它简单描述了 Pod 在其生命周期的阶段。

## 第一阶段
1. `Pending`

正在创建 Pod 但是 Pod 中的容器还没有被全部创建完成，处于此状态的 Pod 应检查 Pod 所依赖的存储是否有权限挂载，调度是否正常等。

2. `Failed`

Pod 中的全部容器都已经终止了，并且至少一个容器是失败终止，即以非零状态退出或被系统终止。

3. `Unknown`

Pod 状态的依靠 `ApiServer` 与节点上的 `kubelet` 通信获得，当出现此状态时意味着 `ApiServer` 与节点 `kubelet` 无法正常通信，通常是由于节点故障导致的。

4. `Error`

Pod 启动过程中出现错误，可能是镜像问题。

5. `Succeeded`

Pod 中所有容器都已终止，且不会再重启，与失败 (Failed)状态想法

## 第二阶段
1. `Running` - Pod 正在运行中
2. `Unschedulable` - Pod 无法被调度，Scheduler 无法找到符合调度条件的节点
3. `PodScheduled` - Pod 正在被调度中，此时 Shceduler 还没有决定 Pod 所分配的节点，在筛选出合适节点后就会更新 etcd 数据并将 Pod 分配到该节点。
4. `Initialized` - Pod 中的初始化容器以完成运行
5. `ImagePullBackOff` - Pod 所在的 node 节点下载镜像失败
6. `InvalidImageName` - 无法解析镜像名称
7.  `ErrImageNeverPull` - 策略禁止拉取镜像
8. `RegistryUnavailable` - 无法连接到镜像注册表
9. `CreateContainerError` - 创建容器失败
10. `RunContainerError` - 启动容器失败
11. `ContainerCreating` - 容器正在创建
12. `PodInitializing` - Pod 初始化中

## 其他状态
1. `Evicted` - 大多数情况是内存或可用硬盘空间不足
2. `CrashLoopBackOff` - 容器启动了，但又因为某些原因异常终止了（多是应用本身的问题）
3. `Error` - Pod 启动时发生错误
4. `Complete` - 完成

# Pod 重启策略
## 类型
1. `Always` - 默认的重启策略：始终重启 Pod
2. `OnFailure` - 仅在容器失败时重启 Pod
3. `Never` - 不重启 Pod

## 示例
使用 `restartPolicy` 字段定义重启策略

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  labels:
    app: ecommerce
  name: ecommerce-super-pets
spec:
  replicas: 3
  template:
    spec:
      restartPolicy: Always # OnFailure/Never
      containers:
      - image: localhost:32000/node-web:3
        name: ecommerce
```

