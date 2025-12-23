---
title: Kubernetes学习笔记十四：Kubernetes Prometheus监控
published: 2025-10-13
pinned: false
description: 在Kubernetes中通过Prometheus监控资源使用
tags: [Kubernetes]
category: DevOps
draft: true
---

#  Prometheus 基础
## 什么是Prometheus
Prometheus 是由SoundCloud 开发的开源监控报警系统和时序列数据库（TSDB），使用Go 语言开发，是Google BorgMon 监控系统的开源版本。

## 核心组件
### Prometheus server
Prometheus server 是整个系统的核心组件，负责收集指标数据、存储数据、运行查询和警报规则，并提供API 服务。它使用HTTP 协议来提供数据查询和写入服务，并将数据存储为时间序列数据库。

### Exporters
Exporters 是一种连接Prometheus 和其他应用程序或服务的中间件。它们可以从各种数据源（如操作系统、应用程序、数据库）中抓取度量指标数据，并将其转换为Prometheus 的数据格式。Prometheus server 通过定时调用Exporter 的HTTP 接口来获取指标数据，然后存储在时间序列数据库中。

### Pushgateway
Pushgateway 是一种特殊类型的Exporter，用于接收由应用程序主动推送的指标数据。它允许应用程序以单次或批量形式向Prometheus 推送指标数据，而不需要Prometheus server 定期拉取数据。Pushgateway 通常用于以下场景：短周期的临时作业、批处理任务等。

### Alertmanager
Alertmanager 是Prometheus 的警报组件，用于处理和发送警报通知。Alertmanager 接收Prometheus server 生成的警报信息，并根据配置的规则进行分类、去重和分组，并根据其严重性和紧急程度发送通知。可

以使用各种通知方式（如电子邮件、短信、Slack 消息、Webhook）来发送警报通知。

### Prometheus 架构
![](https://cdn.nlark.com/yuque/0/2025/png/56115187/1757294541915-0c5dae69-a80e-4be4-889e-e530ab4d7815.png)

# Prometheus 安装与配置
## 基础配置
1. 创建 nfs-provisioner 作为默认存储
2. 创建 monitor namespace
3. 创建 Prometheus 存放目录 - `mkdir -p /opt/monitor/prometheus`

## 安装 Prometheus Server
### 创建 namespace
```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: monitor
```

### 创建 sa 账号 monitor
```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: monitor
  namespace: monitor
```

### 把sa 账号monitor 通过clusterrolebing 绑定到clusterrole 上
```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: monitor-clusterrolebinding
  namespace: monitor
subjects:
- name: monitor
  namespace: monitor
  kind: ServiceAccount
roleRef:
  name: cluster-admin
  kind: ClusterRole
  apiGroup: rbac.authorization.k8s.io
```

### 抽离prometheus 数据存储目录
```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: prometheus-pvc
  namespace: monitor
spec:
  accessModes:
    - ReadWriteMany
  resources:
    requests:
      storage: 20Gi
  storageClassName: nfs-storage
```

### 抽离prometheus 配置文件
```yaml
kind: ConfigMap
apiVersion: v1
metadata:
  labels:
    app: prometheus
  name: prometheus-config
  namespace: monitor
data:
  prometheus.yml: |
    global:
      scrape_interval: 15s
      scrape_timeout: 10s
      evaluation_interval: 1m
```

其中

+ `scrape_interval: 15s`：采集目标主机监控据的时间间隔
+ `scrape_timeout: 10s`：数据采集超时时间，默认10s
+ `evaluation_interval: 1m`：触发告警检测的时间，默认是1m

### 部署Prometheus Server
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: prometheus-server
  namespace: monitor
  labels:
    app: prometheus
spec:
  replicas: 1
  selector:
    matchLabels:
      app: prometheus
  template:
    metadata:
      labels:
        app: prometheus
    spec:
      serviceAccountName: monitor
      containers:
      - name: prometheus
        image: prom/prometheus:v2.37.8
        imagePullPolicy: IfNotPresent
        command:
          - prometheus
          - --config.file=/etc/prometheus/prometheus.yml
          - --storage.tsdb.path=/prometheus
          - --storage.tsdb.retention=720h
          - --web.enable-lifecycle
        ports:
        - containerPort: 9090
          protocol: TCP
        volumeMounts:
        - name: localtime
          mountPath: /etc/localtime
        - name: prometheus-config
          mountPath: /etc/prometheus/prometheus.yml
          subPath: prometheus.yml
        - name: prometheus-storage-volume
          mountPath: /prometheus/
      volumes:
      - name: localtime
        hostPath:
          path: /usr/share/zoneinfo/Asia/Shanghai
      - name: prometheus-config
        configMap:
          name: prometheus-config
          items:
            - key: prometheus.yml
              path: prometheus.yml
              mode: 0644
      - name: prometheus-storage-volume
        persistentVolumeClaim:
          claimName: prometheus-pvc
```

### 使用service 资源暴露prometheus server 端口
```yaml
apiVersion: v1
kind: Service
metadata:
  name: prometheus
  namespace: monitor
spec:
  selector:
    app: prometheus
  type: NodePort
  ports:
  - name: tcp-9090
    port: 9090
    targetPort: 9090
    protocol: TCP
    nodePort: 30090
```

## Prometheus 配置文件热更新
```bash
curl -X POST SERVER_IP:9090/-/reload
```

## 部署 Kube-state-metrics 监控器
`kube-state-metrics` 通过监听API Server 生成有关资源对象的状态指标，比如Deployment、Node、Pod，需要注意的是 `kube-state-metrics` 只是简单的提供一个 metrics 数据，<u>并不会存储这些指标数据</u>，所以可以使用 Prometheus 来抓取这些数据然后存储，主要关注的是业务相关的一些元数据，比如Deployment、Pod、副本状态等；包括调度的replicas 数量，可用数量；多少个Pod 是running/stopped/terminated 状态？Pod 重启了多少次？有多少job 在运行中。

### 克隆 GitHub 项目
```bash
git clone https://github.com/kubernetes/kube-state-metrics
```

### 拷贝出部署 metrics 的资源清单文件
```bash
cp kube-state-metrics/examples/standard/* prometheus/metrices/
```

### 修改 service.yaml 文件
删除

```yaml
clusterIP: None
```

修改为clusterip 类型

### 应用资源清单文件
```bash
kubectl apply -f .
```

## 添加prometheus job 采集集群信息
### 更新 prometheus-config 文件
添加以下内容：

```yaml
kind: ConfigMap
apiVersion: v1
metadata:
  labels:
    app: prometheus
  name: prometheus-config
  namespace: monitor
data:
  prometheus.yml: |
    global:
      scrape_interval: 15s
      scrape_timeout: 10s
      evaluation_interval: 1m
      
    scrape_configs:
      - job_name: 'kube-state-metrics'
        kubernetes_sd_configs:
        - role: endpoints
        scheme: http
        relabel_configs:
        - source_labels: [__meta_kubernetes_namespace,
        __meta_kubernetes_service_name, __meta_kubernetes_endpoint_port_name]
          action: keep
          regex: kube-system;kube-state-metrics;http-metrics
      - job_name: 'kube-state-metrics-self'
        kubernetes_sd_configs:
        - role: endpoints
        scheme: http
        relabel_configs:
        - source_labels: [__meta_kubernetes_namespace,
        __meta_kubernetes_service_name, __meta_kubernetes_endpoint_port_name]
          action: keep
          regex: kube-system;kube-state-metrics;telemetry
```

