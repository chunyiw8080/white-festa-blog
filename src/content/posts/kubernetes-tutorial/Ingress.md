---
title: Kubernetes学习笔记十三：Kubernetes Ingress
published: 2024-11-13
pinned: false
description: 在Kubernetes中通过Ingress实现Web代理、HTTPS站点和灰度发布
tags: [Kubernetes]
category: 容器
draft: false
---

# 概述
## 四层与七层负载均衡
四层的负载均衡就是基于（IP+端口）的负载均衡：在三层负载均衡的基础上，通过发布三层的IP 地址（VIP），然后加四层的端口号，来决定哪些流量需要做负载均衡，对需要处理的流量进行NAT 处理，转发至后台服务器，并记录下这个TCP 或者UDP 的流量是由哪台服务器处理的，后续这个连接的所有流量都同样转发到同一台服务器处理。



七层的负载均衡就是基于虚拟的URL 或主机IP 的负载均衡：在四层负载均衡的基础上（没有四层是绝对不可能有七层的），再考虑应用层的特征，比如同一个Web 服务器的负载均衡，除了根据VIP 加80 端口辨别是否需要处理的流量，还可根据七层的URL、浏览器类别、语言来决定是否要进行负载均衡。举个例子，如果你的Web 服务器分成两组，一组是中文语言的，一组是英文语言的，那么七层负载均衡就可以当用户来访问你的域名时，自动辨别用户语言，然后选择对应的语言服务器组进行负载均衡处理。

## Ingress 简介
在Kubernetes 中，Ingress 是一种API 对象，它充当了将外部网络流量路由到Kubernetes 集群内部服务的入口。它是一个规范化的流量管理方式，可以方便地进行配置和管理。

Ingress 支持扩展的路由规则，包括基于主机、路径、HTTP 方法和其他Web请求流量的路由控制。这使得Ingress 成为将Kubernetes 作为Web 应用程序托管解决方案时的一个理想选择。

在Kubernetes 中，使用不同的Ingress Controller 来实现Ingress 规范。实际上，Ingress Controller 是一种Kubernetes 部署，它通过Ingress API 对象接收流量，实现请求路由和负载平衡等功能。`Nginx Ingress Controller`、`Traefik Ingress Controller` 、`HAProxy Ingress Controller` 等都常用于Kubernetes 中。

总之，Kubernetes Ingress 是一种定义配置和路由网络流量的规范，而Ingress Controller 是用于实现Ingress 规范的Kubernetes 部署。

## Ingress 如何代理 kubernetes 内部应用
1. 安装 Ingress Controller：为了将外部流量路由到内部Kubernetes 应用程序， 需要安装并配置一种Ingress Controller ， 例如Nginx Ingress Controller、Traefik Ingress Controller 或HAProxy Ingress Controller。

通常情况下，可以使用Helm Charts 或者官方提供的YAML 文件来安装Ingress Controller。

2. 创建一个新的Kubernetes Service：Ingress Controller 需要知道要将流量路由到哪个Service 上，因此首先需要创建一个新的Service 对象，可以使用Deployment 或Pod 来创建后端服务，或使用ServiceType: `ClusterIP` 来创建一个单独的Service 对象。
3. 创建Ingress 对象并定义路由规则：创建一个新的Ingress 对象，并定义流量路由规则。路由规则可以基于主机、路径、HTTP 方法和其他Web 请求流量进行控制，并且可以在不同服务间进行负载均衡。
4. 检查Ingress 资源是否正常运行：使用kubectl 命令检查新创建的Ingress 资源的状态，确保它被成功地应用到Kubernetes 集群中，并且可以正常处理流量。

## Ingress 与 Service 的关系
+ **Ingress** 主要负责应用层（L7）的流量入口和路由，根据域名、路径等规则，把请求转发到指定的 **Service**。
+ **Service** 负责四层（L4）的负载均衡和服务发现，把请求分发到对应的 Pod 上。
+ 所以，**实际的流量负载均衡分配给各个 Pod，仍然是由 Service 来实现的**，Ingress 是入口的路由和流量管理层。

## Ingress 应用场景
1. Web 应用程序：对于基于Web 的应用程序，可以使用Kubernetes Ingress将不同的路径和主机名路由到不同的服务，实现灵活的请求路由和负载均衡。
2. API Gateway：在微服务架构中，API Gateway 是将多个微服务后端聚合到一个入口点的一种常见模式。使用Kubernetes Ingress 可以很容易地实现APIGateway 模式，并提供灵活的请求路由、负载均衡和API 版本控制等功能。
3. SSL/TLS 终止点：Kubernetes Ingress 可以在请求进入集群内部之前进行SSL/TLS 协议的终止。这可以让应用程序仅需要处理普通HTTP 请求，而由Ingress Controller 处理加密和解密的过程。
4. 应用程序流量控制：可以通过Kubernetes Ingress 设置流量规则和限制，对外部请求进行限制，减少恶意攻击并保护应用程序免受DDoS 攻击。

# 在 kubernetes 集群中部署 nginx ingress controller
## 官方网址
[GitHub - kubernetes/ingress-nginx: Ingress NGINX Controller for Kubernetes](https://github.com/kubernetes/ingress-nginx/)

# Ingress 语法
## 可用
| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `spec.defaultBackend` | Object | Ingress 规范中的一个参数，用于指定没有匹配到任何规则的请求该发送到哪个后端服务。可以是已有的 Service、Deployment，也可以是自定义的资源对象。只能指定一个。 |
| `spec.defaultBackend.resource` | Object | 指定后端服务为 Deployment 等，也可以是自定义的资源对象。 |
| `spec.defaultBackend.resource.apiGroup` | string | 指定资源的 API 组。 |
| `spec.defaultBackend.resource.kind` | string | 指定资源的类型。 |
| `spec.defaultBackend.resource.name` | string | 指定资源的名称。 |
| `spec.defaultBackend.service` | Object | 指定后端服务为 Service。 |
| `spec.defaultBackend.service.name` | string | 指定 Service 的名称。 |
| `spec.defaultBackend.service.port` | Object | 指定 Service 的端口。 |
| `spec.ingressClassName` | string | 可选参数，用于指定使用哪个 Ingress Controller 处理该规则。多个 Controller 可以共存，此字段用于区分。例如 Nginx Ingress Controller 时该字段设置为 `nginx`。 |
| `spec.rules` | []Object | 路由规则数组。每个规则定义一个 host 对应的一组 URL 路径路由。 |
| `spec.rules.host` | string | 规则的主机名（域名），用于匹配请求中的 Host 字段。 |
| `spec.rules.http` | Object | HTTP 路由规则集合，定义多个路径以及每个路径对应的后端服务。 |
| `spec.rules.http.paths` | []Object | URL 路径路由规则数组。定义路径以及对应的后端转发逻辑。 |
| `spec.rules.http.paths.backend` | Object | 每条路径所对应的后端目标对象，可以是已有的 Service、Deployment 或自定义对象。只能指定一个。 |
| `spec.rules.http.paths.backend.resource` | Object | 后端目标为资源对象（如 Deployment、自定义资源等）。 |
| `spec.rules.http.paths.backend.service` | Object | 后端目标为 Service。 |
| `spec.rules.http.paths.backend.service.name` | string | 后端 Service 的名称。 |
| `spec.rules.http.paths.backend.service.port` | Object | 后端 Service 的端口。 |
| `spec.rules.http.paths.path` | string | 路径字符串，用于匹配 URL 路径。必须以 `/` 开头。 |
| `spec.rules.http.paths.pathType` | string | 路径的匹配类型。可选值：`Prefix`（前缀匹配）或 `Exact`（精确匹配）。 |
| `spec.tls` | []Object | TLS 配置列表，包含证书和密钥的 Secret 及适用的域名。 |
| `spec.tls.hosts` | []string | 使用该证书的主机名数组。 |
| `spec.tls.secretName` | string | 包含 TLS 证书和私钥的 Kubernetes Secret 的名称，必须包含 `tls.crt` 和 `tls.key` 两个字段。 |


## Ingress PathType 匹配类型
Ingress 中的每个路径都需要有对应的路径类型（Path Type）。未明确设置pathType 的路径无法通过合法性检查。当前支持的路径类型有三种：

+ `Prefix`：前缀匹配。当请求的路径<u>以Path 的值开头时</u>，将进行匹配。例如，如果将Path 定义为/example，则路径/example/foo 和/example/bar 都将匹配。
+ `Exact`：完全匹配。当请求的路径<u>完全与Path 的值相同时</u>，才会进行匹配。例如，如果将Path 定义为 `/example`，则路径 `/example` 才会匹配。
+ `ImplementationSpecific` ： 对于这种路径类型， 匹配方法取决于IngressClass。具体实现可以将其作为单独的pathType 处理或者与Prefix 或Exact 类型作相同处理。

# Ingress 实战
## Ingress 代理 Web 服务
### 部署 Web 服务
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: nginx-html
  namespace: default
data:
  index.html: |
    <html>
      <body>
        <h1>Hello this is web-app</h1>
      </body>
    </html>
---
apiVersion: apps/v1
kind: Deployment
metadata:
  labels:
    app: web-app
  name: web-app
spec:
  replicas: 1
  selector:
    matchLabels:
      app: web-app
  template:
    metadata:
      labels:
        app: web-app
    spec:
      containers:
      - image: nginx:latest
        name: nginx
        ports:
        - containerPort: 80
        volumeMounts:
          - name: nginx-html-mount
            mountPath: /usr/share/nginx/html/index.html
            subPath: index.html
      volumes:
        - name: nginx-html-mount
          configMap:
            name: nginx-html
---
apiVersion: v1
kind: Service
metadata:
  labels:
    app: web-app-service
  name: web-app-service
spec:
  type: ClusterIP
  ports:
  - name: 80-80
    port: 80
    protocol: TCP
    targetPort: 80
    appProtocol: TCP
  selector:
    app: web-app
```

### 部署 Ingress
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ingress-myapp
  namespace: default
spec:
  ingressClassName: nginx
  rules:
  - host: web-app.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: web-app-service
            port:
              number: 80
```

### 测试验证
使用 curl 命令模拟 DNS 解析

```bash
curl --resolve web-app.com:80:10.0.0.85 http://web-app.com
```

结果

```bash
[root@microk8s-85 ~]#curl --resolve web-app.com:80:10.0.0.85 http://web-app.com
<html>
  <body>
    <h1>Hello this is web-app</h1>
  </body>
</html>
```

## Ingress 代理 HTTPS 站点
1. 为 SSL 证书创建 secret

```bash
kubectl create secret tls website-secret --cert=tls.crt --key=tls.key
```

2. 创建 Ingress

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ingress-myapp
  namespace: default
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - web-app.com
    secretName: website-secret
  rules:
  - host: web-app.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: web-app-service
            port:
              number: 80
```

## Ingress Nginx 添加Basic Auth 安全认证
### 生成密钥
1. 安装httpd-tools 服务

```bash
yum -y install httpd-tools
```

2. 生成密码文件，命令格式：“htpasswd -c 密码文件 用户名”

在创建secret 之前通过htpasswd 工具生成的记录用户名密码的文件的文件名，必须叫auth，不然最终访问的结果会是503 错误。

```bash
htpasswd -c auth admin
New password:
Re-type new password:
Adding password for user admin
```

3. 查看生成好的秘钥

```bash
cat auth
admin:$apr1$nUBvOqcj$qviQ/ryMxgfCqh4RyWOJY.
```

### 创建Secret 资源存储用户密码
```bash
kubectl create secret generic auth --from-file=auth
```

### 配置ingress 认证
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ingress-myapp
  annotations:
    nginx.ingress.kubernetes.io/auth-type: basic
    nginx.ingress.kubernetes.io/auth-secret: auth
  namespace: default
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - web-app.com
    secretName: website-secret
  rules:
  - host: web-app.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: web-app-service
            port:
              number: 80
```

## Ingress 控制器实现灰度（金丝雀）发布
灰度发布（又名金丝雀发布）是指在黑与白之间，能够平滑过渡的一种发布方式。在其上可以进行A/B testing，即让一部分用户继续用产品特性A，一部分用户开始用产品特性B，如果用户对B没有什么反对意见，那么逐步扩大范围，把所有用户都迁移到B上面来。

### 使用的几种关键 Canary 规则
|  规则  |  描述  |  取值  |
| --- | --- | --- |
| `nginx.ingress.kubernetes.io/canary` | 必须设置该Annotation 值为true，否则其它规则将不会生效。 | true/false |
| `nginx.ingress.kubernetes.io/canary-by-header` | 表示基于请求头的名称进行灰度发布。请求头名称的特殊取值： | always：无论什么情况下，流量均会进入灰度服务。never：无论什么情况下，流量均不会进入灰度服务。<br/>若没有指定请求头名称的值，则只要该头存在，都会进行流量转发。 |
| `nginx.ingress.kubernetes.io/canary-by-header-value` | 表示基于请求头的值进行灰度发布，需要与canary-by-header 头配合使用 | string |
| `nginx.ingress.kubernetes.io/canary-weight` | 表示基于权重进行灰度发布。 | 取值范围：0~权重总值。若未设定总值，默认总值为100。 |
| `nginx.ingress.kubernetes.io/canary-weight-total` | 表示设定的权重总值 | 若未设定总值，默认总值为100。 |


### 基于服务权重的流量切分
#### 主 Ingress 配置
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ingress-myapp
  namespace: default
spec:
  ingressClassName: nginx
  rules:
  - host: web-app.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: web-app-service-v1 # 此时流量导向的是v1服务
            port:
              number: 80
```

#### 旧版应用配置
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: nginx-html-v1
  namespace: default
data:
  index.html: |
    <html>
      <body>
        <h1>Hello this is web-app-v1</h1>
      </body>
    </html>
---
apiVersion: apps/v1
kind: Deployment
metadata:
  labels:
    app: web-app-v1
  name: web-app-v1
spec:
  replicas: 1
  selector:
    matchLabels:
      app: web-app-v1
  template:
    metadata:
      labels:
        app: web-app-v1
    spec:
      containers:
      - image: nginx:latest
        name: nginx
        ports:
        - containerPort: 80
        volumeMounts:
          - name: nginx-html-mount
            mountPath: /usr/share/nginx/html/index.html
            subPath: index.html
      volumes:
        - name: nginx-html-mount
          configMap:
            name: nginx-html-v1
---
apiVersion: v1
kind: Service
metadata:
  labels:
    app: web-app-service-v1
  name: web-app-service-v1
spec:
  type: ClusterIP
  ports:
  - name: 80-80
    port: 80
    protocol: TCP
    targetPort: 80
    appProtocol: TCP
  selector:
    app: web-app-v1
```

#### 新版应用配置
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: nginx-html-v2
  namespace: default
data:
  index.html: |
    <html>
      <body>
        <h1>Hello this is web-app-v2</h1>
      </body>
    </html>
---
apiVersion: apps/v1
kind: Deployment
metadata:
  labels:
    app: web-app-v2
  name: web-app-v2
spec:
  replicas: 1
  selector:
    matchLabels:
      app: web-app-v2
  template:
    metadata:
      labels:
        app: web-app-v2
    spec:
      containers:
      - image: nginx:latest
        name: nginx
        ports:
        - containerPort: 80
        volumeMounts:
          - name: nginx-html-mount
            mountPath: /usr/share/nginx/html/index.html
            subPath: index.html
      volumes:
        - name: nginx-html-mount
          configMap:
            name: nginx-html-v2
---
apiVersion: v1
kind: Service
metadata:
  labels:
    app: web-app-service-v2
  name: web-app-service-v2
spec:
  type: ClusterIP
  ports:
  - name: 80-80
    port: 80
    protocol: TCP
    targetPort: 80
    appProtocol: TCP
  selector:
    app: web-app-v2
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ingress-web-app-canary
  namespace: default
  annotations:
    nginx.ingress.kubernetes.io/canary: "true"
    nginx.ingress.kubernetes.io/canary-weight: "10"  # 表示10%的流量走 v2
spec:
  ingressClassName: nginx
  rules:
  - host: web-app.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: web-app-service-v2
            port:
              number: 80
```

#### 系统上线
系统运行一段时间后，当新版本服务已经稳定并且符合预期后，需要下线老版本的服务，仅保留新版本服务在线上运行。

1. 将主 ingress 配置中的 `.spec.rules[].http.paths[].backend.service.name` 指向新版本的 service name
2. 删除新版本配置文件中的临时 ingress 控制器



> 为什么不设置新版本 ingress Canary 为 100% 来实现流量切换？
>

这将导致：

+ 主 Ingress 仍指向 v1
+ 但 100% 流量都被 Canary Ingress 劫持到 v2

这个方法确实会使流量都流向 v2，但此时 v1 仍然存在，只是没有实际处理流量而已。因此这种方式不是最终“切换”，而是“流量劫持”长远来看，应该清理掉 canary 结构，并将主 Ingress 指向 v2，以避免配置混乱、潜在误解和未来维护难度。

### 基于客户端请求头的流量切分
#### 旧版配置、新版配置、主 ingress
和之前的一样：[https://www.yuque.com/mangshangyue-qszkg/idkuk7/me38z0tcy7ydobu5?language=zh-CN#Et4OE](#Et4OE)

#### 新版 Ingress 控制器
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ingress-web-app-canary
  namespace: default
  annotations:
    nginx.ingress.kubernetes.io/canary: "true"
    nginx.ingress.kubernetes.io/canary-by-header: "X-Canary"
    nginx.ingress.kubernetes.io/canary-by-header-value: "true"
spec:
  ingressClassName: nginx
  rules:
  - host: web-app.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: web-app-service-v2
            port:
              number: 80
```

#### 如何让用户可以携带`X-Canary`Header？
1. 在前端代码中利用随机数为用户添加 Header

```javascript
// 判断用户是否已经打过标记
if (!document.cookie.includes("canary_user")) {
  // 随机分配 10% 用户进入 canary
  const isCanary = Math.random() < 0.1;
  document.cookie = `canary_user=${isCanary}; path=/; max-age=31536000`; // 保留一年
}
// 读取 cookie 判断是否是 canary 用户
const isCanaryUser = document.cookie.includes("canary_user=true");
// 添加 header
fetch("/api/data", {
  headers: isCanaryUser ? { "X-Canary": "true" } : {}
});
```

2.  Nginx 入口按 Cookie 注入 Header

```nginx
# 如果请求中包含 canary_user=true，就加上 X-Canary 头
map $http_cookie $canary_header {
    default "";
    "~*canary_user=true" "true";
}
server {
  location / {
    proxy_set_header X-Canary $canary_header;
    proxy_pass http://your-upstream;
  }
}
```

3.  网关层自动打标 
    1.  如果有 API 网关、Service Mesh（如 Istio、Envoy）  
    2.  可以直接基于 IP 哈希、用户 ID、Cookie 等做分流，不再依赖前端控制 Header；  
    3. 通常这类系统已经具备流量打标能力，Header 是自动加的。

### 基于权重分流和基于 Header 分流的对比
| 对比维度 | 基于 Header | 基于权重 |
| --- | --- | --- |
| **控制精度** | 精确（只影响带 Header 的请求） | 随机分流，不可控 |
| **适合测试** | 非常适合：只让内部测试流量进入新版 | 不适合定向测试，只能观察全量指标 |
| **上线验证风险** | 风险低，用户无感知 | 有一定风险，真实用户可能命中新版 |
| **需要客户端配合** | 需要测试客户端/工具带 Header | 不需要客户端配合 |
| **适合 A/B 测试** | 不适合（不是自动分组） | 更适合 A/B 测试类需求 |
| **配置复杂度** | 略高 | 更简单直接 |
| **自动化支持** | 适合自动灰度脚本控制 | 也适合但粒度较粗 |
| **日志排查与回溯** | 明确哪些流量进了新版 | 难以定位具体某个请求是否进了新版 |


