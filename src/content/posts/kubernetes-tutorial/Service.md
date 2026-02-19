---
title: Kubernetes学习笔记八：Kubernetes Service
published: 2024-06-03
pinned: false
description: 通过Kubernetes Service将工作负载对外暴露
tags: [Kubernetes]
category: 容器
draft: false
---

在 Kubernetes 中，Service 是一种抽象资源，用于定义一组 Pod 的访问策略。它为这些 Pod 提供统一的访问入口，解决 Pod 的 IP 不稳定问题，实现负载均衡和服务发现等功能。

# Service 的作用
| 功能 | 说明 |
| --- | --- |
| **服务发现** | 为一组具有相同标签的 Pod 提供一个固定的访问地址（ClusterIP 或其他）。 |
| **负载均衡** | 将访问请求均衡地分发到后端多个 Pod。 |
| **解耦应用组件** | 客户端只需知道服务名称，而不关心具体 Pod 的 IP。 |
| **跨命名空间通信（通过 DNS）** | 可以使用 `<service>.<namespace>.svc.cluster.local` 形式访问服务。 |


#  Service 配置文件结构 
| 字段路径 | 类型 | 示例/说明 |
| --- | --- | --- |
| `apiVersion` | string | `v1`（固定） |
| `kind` | string | `Service`（固定） |
| `metadata.name` | string | 服务名称 |
| `metadata.namespace` | string | 所在命名空间（默认是 `default`） |
| `spec.selector` | map | `{app: nginx}`，选择匹配的 Pod |
| `spec.type` | string | `ClusterIP` / `NodePort` / `LoadBalancer` / `ExternalName` |
| `spec.ports` | list | 服务端口定义列表，详见下方子字段 |
| `spec.ports[].port` | int | 服务暴露的端口 |
| `spec.ports[].targetPort` | int/string | 后端 Pod 的端口（可为名称或数字） |
| `spec.ports[].protocol` | string | `TCP`（默认）或 `UDP` |
| `spec.ports[].name` | string | 可选，为端口命名 |
| `spec.ports[].nodePort` | int | 如果是 NodePort 类型，指定暴露的节点端口 |
| `spec.clusterIP` | string | 默认自动分配，可以指定或设置为 `None`（即 Headless） |
| `spec.externalName` | string | 如果类型为 `ExternalName`，这里指定外部域名 |
| `spec.sessionAffinity` | string | `None`（默认）或 `ClientIP`，用于保持连接会话 |
| `spec.externalTrafficPolicy` | string | `Cluster`（默认）或 `Local`，仅 NodePort/LoadBalancer 使用 |
| `spec.loadBalancerIP` | string | 指定静态负载均衡 IP（在某些云平台支持） |
| `spec.healthCheckNodePort` | int | 设置用于健康检查的端口（仅 LoadBalancer 类型） |


# Service 的类型
| 类型 | 描述 |
| --- | --- |
| **ClusterIP（默认）** | 只在集群内部可访问，提供一个集群内 IP。 |
| **NodePort** | 在每个节点开放一个端口，通过该端口可从外部访问服务。 |
| **LoadBalancer** | 与云服务提供商集成，分配一个外部负载均衡器。 |
| **ExternalName** | 将服务映射到外部 DNS 名称，不创建代理规则。 |
| **Headless（无 ClusterIP）** | `clusterIP: None`，用于暴露 Pod 实际 IP，实现自定义服务发现（如 StatefulSet）。 |


# 实践
有这样一个 deployment，为它配置 service 流量入口

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  labels:
    app: test-nginx-1
  name: test-nginx-1
spec:
  replicas: 2
  selector:
    matchLabels:
      app: test-nginx-1
  template:
    metadata:
      labels:
        app: test-nginx-1
    spec:
      containers:
      - image: nginx:latest
        name: nginx
        ports:
        - containerPort: 80
```

## 使用 Cluster IP
Cluster IP 只适用于集群的内部访问，节点外无法访问服务

```yaml
apiVersion: v1
kind: Service
metadata:
  labels:
    app: test-nginx-cluster-ip
  name: test-nginx-cluster-ip
spec:
  type: ClusterIP
  ports:
  - name: 80-80
    port: 80
    protocol: TCP
    targetPort: 80
    appProtocol: TCP
  selector:
    app: test-nginx-1
```

### Cluster IP 如何将流量转发给 Pod？
使用 `kubectl describe svc test-nginx-cluster-ip`可以得到以下信息：

```plain
Name:                     test-nginx-1-svc
Namespace:                default
Labels:                   app=test-nginx-1-svc
Annotations:              <none>
Selector:                 app=test-nginx-1
Type:                     ClusterIP
IP Family Policy:         SingleStack
IP Families:              IPv4
IP:                       10.152.183.166
IPs:                      10.152.183.166
Port:                     80-80  80/TCP
TargetPort:               80/TCP
Endpoints:                10.1.157.243:80,10.1.157.244:80
Session Affinity:         None
Internal Traffic Policy:  Cluster
Events:                   <none>
```

1. 其中 `endpoints` 也是 kubernetes 中的一种工作资源，它与 service 是一对紧密关联的概念。用一句话来理解： Service 是一个访问入口，Endpoints 是它“实际连接到的 Pod 列表”。
2. 当 service 服务被创建时，service 会同步创建一个 endpoints 对象，该对象记录了可接受流量转发的 ip 地址，也就是说，endpoints 实际上是 service 的`连接池`
3. 使用 `kubectl get endpoints` 可以 查看连接池：

```yaml
NAME               ENDPOINTS                         AGE
kubernetes         10.0.0.85:16443                   13d
test-nginx-1-svc   10.1.157.243:80,10.1.157.244:80   11m
```

4. 当客户端发起一个请求，访问 service 的 Cluster IP 地址时，请求先到达 kubernetes 集群节点上的 `kube-proxy` 组件。`kube-proxy` 会根据 service 监听的端口号和协议选择对应的后端地址和端口，然后转发请求到这些后端 Pod 上。`kube-proxy` 会根据 `iptables` 规则或 `IPVS` 负载均衡算法等方式来做请求的负载均衡。

![画板](https://cdn.nlark.com/yuque/0/2025/jpeg/56115187/1749443731241-00faa9e9-739c-45e1-85e6-fb26792953bf.jpeg)

### 集群的绝对域名（FQDN）
Service 只要创建完成，就会生成一个绝对域名用于集群内部资源的解析，每个服务创建完成后都会在集群 dns 中动态添加一个资源记录，资源记录格式是：

```plain
SVC_NAME.NS_NAME.DOMAIN.LTD
```

即 服务名称.命名空间.域名后缀，集群的默认域名后缀是 `svc.cluster.local`

因此，以这个创建的 Cluster IP 服务为例，它的绝对域名是：`test-nginx-1-svc.default.svc.cluster.local`，在任何一个 Pod 内都可以访问到它

```plain
[root@microk8s-85 ~]#kubectl exec -it test-nginx-1-7df69d5c76-t5n68 -- bash
root@test-nginx-1-7df69d5c76-t5n68:/# curl test-nginx-1-svc.default.svc.cluster.local
<!DOCTYPE html>
<html>
<head>
<title>Welcome to nginx!</title>
<style>
html { color-scheme: light dark; }
body { width: 35em; margin: 0 auto;
font-family: Tahoma, Verdana, Arial, sans-serif; }
</style>
</head>
<body>
<h1>Welcome to nginx!</h1>
<p>If you see this page, the nginx web server is successfully installed and
working. Further configuration is required.</p>

<p>For online documentation and support please refer to
<a href="http://nginx.org/">nginx.org</a>.<br/>
Commercial support is available at
<a href="http://nginx.com/">nginx.com</a>.</p>

<p><em>Thank you for using nginx.</em></p>
</body>
</html>
root@test-nginx-1-7df69d5c76-t5n68:/# 

```

该特性在集群中的多个应用夸命名空间通信起到非常重要的作用

## 使用 NodePort
### NodePort 介绍
**NodePort** 是 Kubernetes 中一种 Service 类型，它通过在每个节点上开放一个端口，将集群内部的服务暴露到集群外部，使用户可以通过 `<NodeIP>:<NodePort>` 的方式访问服务。  

NodePort 不适合在生产环境下使用，这是因为

1.  端口范围有限：NodePort 的端口范围是 默认 30000-32767，一共只有 2768 个端口，容易冲突、难以管理。
2. 暴露整个集群节点：所有节点都暴露该端口，增加了 安全攻击面。无法细粒度控制访问来源。
3.  缺乏负载均衡能力：虽然访问任意节点都可转发流量，但这种 轮询不是真正的 L7 负载均衡，且无健康检查策略。
4. 不支持 HTTPS/域名绑定：只能使用 IP + 端口访问，无法配置 TLS、域名路由等企业级要求。
5. 公网访问麻烦：通常需要手动开放防火墙端口或配置公网 IP，与云平台集成度低。

### 根据之前的 deployment 完成 NodePort 服务部署
```yaml
apiVersion: v1
kind: Service
metadata:
  labels:
    app: test-nginx-1-svc
  name: test-nginx-1-svc
spec:
  ports:
  - name: 80-80
    nodePort: 32001 # 对外暴露的节点端口
    port: 80 # 逻辑层的服务端口
    protocol: TCP
    targetPort: 80 # Pod接收请求的实际端口
  selector:
    app: test-nginx-1
  type: NodePort
```

由于 NodePort 提供外部访问能力，因此相比于 Cluster IP，多了一个流量转发层。

### 流量流向解释
1. 用户访问：用户从集群外访问某个节点的 IP 和端口，如：`http://<NodeIP>:30080`。这个端口就是 `nodePort`
2. 节点端口接收流量：Kubernetes 在该节点上监听 32001 端口（所有集群节点上都会监听）。
3. 转发到 Service 的 `port`：接收到的流量会通过 `kube-proxy` 转发到 Service 的 `port: 80`（这是一个逻辑端口，供内部使用）。
4. Service 负载均衡到后端 Pod：Service 会根据其 selector 匹配的 Pod 列表，使用轮询/随机等方式将流量分发到其中一个 Pod。
5. 转发到 Pod 的容器端口：流量被发送到该 Pod 的容器 `targetPort: 8080`，即该容器真实监听的端口。

### 修改 NodePort 的可用端口范围
Kubernetes 中 NodePort 的可用端口范围默认是 `30000–32767`，要想修改这一范围，需要修改 `kube-apiserver` 和 `kubelet` 的配置。

NodePort 的分配范围是由 Kubernetes 控制平面的组件 `kube-apiserver` 决定的，其配置项为：`--service-node-port-range=<起始端口>-<结束端口>`

对于使用kubeadm 安装的集群：

1. 编辑 kube-apiserver 的配置

```bash
vim /etc/kubernetes/manifests/kube-apiserver.yaml
```

2. 找到类似如下的启动参数部分，添加或修改

```yaml
spec:
  containers:
  - command:
    - kube-apiserver
    - --service-node-port-range=20000-40000  # 添加这一行
```

3. 保存文件后，kubelet 会自动重启该静态 Pod。
4.  验证是否生效 : `kubectl describe node <node-name> | grep "Service Node Port Range"` 

## 使用 External Name 连接集群内外的服务
### 概念
在 Kubernetes 中，ExternalName 是一种特殊类型的 Service，用于将一个集群内的服务名称映射到 集群外部的 DNS 名称。ExternalName 类型的 Service 不会创建任何 ClusterIP，也不会进行负载均衡或代理，而是通过 DNS CNAME 记录 将 Service 名称解析为外部主机名。

也就是说ExternalName 的本质作用就是将 Kubernetes 集群内部的服务名映射到外部的 DNS 域名，起到“桥梁”作用，方便集群内程序访问集群外的服务。

### 示例
假如有一个mysql数据库服务，部署在公网虚拟机上，ip地址是44.128.17.88，还有一个域名db.qucikservice.net解析到了这个域名上。 然后有一个python django程序用来执行数据库增删改查操作，可以使用 External Name 让 django 程序连接到数据库，方法如下：

1. 创建 ExternalName Service

```yaml
apiVersion: v1
kind: Service
metadata:
  name: mysql-service
  namespace: default
spec:
  type: ExternalName
  externalName: db.quickservice.net
```

2. 在 Django 的 setting.py 中配置数据库连接

```python
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.mysql',
        'NAME': 'your_database_name',
        'USER': 'your_username',
        'PASSWORD': 'your_password',
        'HOST': 'mysql-service',   # 使用 ExternalName service 名称
        'PORT': '3306',
    }
}
```

3. 使用 deployment 部署 django 服务

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: django-app
spec:
  replicas: 2
  selector:
    matchLabels:
      app: django-app
  template:
    metadata:
      labels:
        app: django-app
    spec:
      containers:
      - name: django
        image: your-django-image:latest
        env:
        - name: DJANGO_DB_HOST
          value: mysql-service
        - name: DJANGO_DB_NAME
          value: your_database_name
        - name: DJANGO_DB_USER
          valueFrom:
            secretKeyRef:
              name: mysql-secret
              key: username
        - name: DJANGO_DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: mysql-secret
              key: password
```

成功部署后，django 会尝试使用集群的 FQDN 来连接数据库 `mysql-service.default.svc.cluster.local`,  由于 ExternalName 的存在，当访问该域名时，集群 DNS 会返回一个 CNAME：db.quickservice.net，然后应用会自己发起 TCP 连接到这个域名。

---

> 由此可知，`ExternalName` 类型的 Service 在 Kubernetes 中的本质就是：
>
> 向 Kubernetes 内部的 DNS 系统（CoreDNS） 添加一条 CNAME 记录，将集群内的 Service 名称映射到集群外的一个域名。
>

## 使用无标签选择器的 Service 结合自定义 EndPoints 关联外部服务
使用无标签选择器的 Service 结合自定义 EndPoints 可以将外部的服务设为接受通过 kubernetes service 接受请求的地址池。

比如在 10.0.0.31 机器上部署了一个 mysql 数据库，如何让 k8s 集群中部署的后端程序能够在这个数据库中执行增删改查操作？

### 声明 service 资源
```yaml
apiVersion: v1
kind: Service
metadata:
  name: db-service
spec:
  clusterIP: None
  #type: ClusterIP
  ports:
  - port: 3306
```

使用`clusterIP: None`而不是`type: ClusterIP`的原因：

1. 使用`clusterIP: None`，DNS 查询返回的是 Endpoints 中的 IP 直接地址；
2. 不依赖 kube-proxy，不会创建虚拟 IP 和 iptables 转发规则
3. 如果使用 `type: ClusterIP` 在 Endpoints 是“手动创建的非 Pod 地址”的情况下，有时会出现转发异常（取决于 CNI 和 kube-proxy 行为）

在应用此文件后，若使用 `kubectl describe svc mysql-service`可以发现其 EndPoints 列表是空的。

### 创建 EndPoints 文件
注意 EndPoints 的名称必须对应 Service 的名称

```yaml
apiVersion: v1
kind: Endpoints
metadata:
  name: db-service
subsets:
- addresses:
  - ip: 10.0.0.31
  ports:
  - port: 3306
    protocol: TCP
```

### 检查
在应用了两个资源清单文件后，执行 `kubectl describe svc db-service`可以查看结果

```yaml
Name:                     db-service
Namespace:                default
Labels:                   <none>
Annotations:              <none>
Selector:                 <none>
Type:                     ClusterIP
IP Family Policy:         SingleStack
IP Families:              IPv4
IP:                       10.152.183.70
IPs:                      10.152.183.70
Port:                     <unset>  3306/TCP
TargetPort:               3306/TCP
Endpoints:                10.0.0.31:3306
Session Affinity:         None
Internal Traffic Policy:  Cluster
Events:                   <none>
```

可见声明的 EndPoints 已经成为了 service 的地址池

# Service 端口映射流程图
```yaml
客户端流量
    │
    ▼
Service（ClusterIP）
    ├── port: 80            ← 接收客户端流量的端口
    └── targetPort: web     ← 转发给 Pod 端口名为 web 的容器端口
              │
              ▼
    Pod（通过 label selector 选中的）
        └── containerPort: 80
            name: web       ← 容器监听的真实端口
```

解释

| 位置 | 字段名 | 含义 | 举例 |
| --- | --- | --- | --- |
| Service | `port` | Service 对外暴露的端口（集群内外部请求流量进入的端口） | `80` |
| Service | `targetPort` | 请求应该被转发到 Pod 中哪个端口，可以是数字或端口名 | `web`<br/> 或 `80` |
| Pod → container | `containerPort` | 容器真正监听请求的端口，必须和 `targetPort`<br/> 匹配（直接或通过名字） | `80`<br/>，`name: web` |


