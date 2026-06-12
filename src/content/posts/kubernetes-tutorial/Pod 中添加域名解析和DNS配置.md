---
title: Kubernetes学习笔记六：在Pod中添加域名解析和DNS配置
published: 2024-04-17
pinned: false
description: 使用hostAliases进行别名映射；在Pod中配置域名解析。
tags: [Kubernetes]
category: 容器
draft: false
---

# 使用 hostAliases 字段添加域名解析
hostAliases 用于将一些主机别名映射到 Pod 内的 IP 地址，以便 Pod 可以通过这些别名来访问主机上的服务。

## 添加域名解析
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  labels:
    app: test-nginx
  name: test-nginx
spec:
  replicas: 5
  selector:
    matchLabels:
      app: test-nginx
  template:
    metadata:
      labels:
        app: test-nginx
    spec:
      containers:
      - image: nginx:latest
        name: nginx
        ports:
        - containerPort: 80
      hostAliases:
      - ip: "192.168.31.213"
        hostnames:
        - "test-db-1"
        - "test-db-2"
```

## Pod 中添加 DNS 解析
### dnsPolicy
| 取值 | 含义 | 说明 |
| --- | --- | --- |
| `Default` | 默认策略 | 使用集群默认的 DNS 配置。对于普通 Pod，一般是 ClusterFirst。对于主机网络（`hostNetwork: true`）的 Pod，则使用宿主机的 `/etc/resolv.conf`。 |
| `ClusterFirst` | **默认行为**（除非 hostNetwork=true） | 使用集群内的 DNS 服务（kube-dns/CoreDNS），优先解析 Kubernetes Service 名称。 |
| `ClusterFirstWithHostNet` | 主机网络下也使用集群 DNS | 如果使用 `hostNetwork: true`，但仍希望使用集群 DNS，就用这个值。 |
| `None` | 禁用自动 DNS 配置 | 表示你会手动指定 `dnsConfig` 字段来自定义 `/etc/resolv.conf`。适用于需要精细控制 DNS 的情况。 |


### dnsConfig
仅当`dnsPolicy` 值为 `None` 时才有效

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: custom-dns-deployment
spec:
  replicas: 1
  selector:
    matchLabels:
      app: custom-dns-app
  template:
    metadata:
      labels:
        app: custom-dns-app
    spec:
      dnsPolicy: None
      dnsConfig:
        nameservers:
          - 1.1.1.1
          - 8.8.8.8
        searches:
          - mynamespace.svc.cluster.local
          - svc.cluster.local
          - cluster.local
        options:
          - name: ndots
            value: "2"
          - name: timeout
            value: "1"
          - name: single-request
      containers:
        - name: app
          image: busybox
          command: ["sleep", "3600"]
```

1. searches
    1. 设置 DNS 搜索域（search domains），即当容器中的进程尝试解析一个 非全限定域名（FQDN，即完整的域名） 时，系统会依次在这些域后面补全进行尝试解析。
    2. 对于上面的例子，假如容器内尝试解析 `nginx`时，实际的解析会是：
        * `nginx.mynamespace.svc.cluster.local`
        * `nginx.svc.cluster.local`
        * `nginx.cluster.local`

直到找到解析成功的一个。

    3. 太多 search 域可能会让 DNS 查询变慢，Linux 默认最大是 6 个。
    4. 如果你写的是完整的域名（如 `nginx.default.svc.cluster.local.`，带点结尾），search 不会被应用
2. options 
    1. 配置 DNS 解析器的行为（相当于 /etc/resolv.conf 中的 options 行），包括重试次数、域名补全策略等。
    2. 常见选项

| name | value | 说明 |
| --- | --- | --- |
| `ndots` | `5`（默认） | 控制带点的域名是否被视作“相对域名”。值越小，越容易被当作“绝对域名”。 |
| `timeout` | `2` | DNS 查询的超时时间（秒） |
| `attempts` | `3` | 尝试查询的次数 |
| `rotate` | 无 | 使用 `/etc/resolv.conf` 中多个 nameserver 轮询查询 |
| `single-request` | 无 | 强制使用 IPv4 和 IPv6 分别发起请求（兼容某些网络问题） |


