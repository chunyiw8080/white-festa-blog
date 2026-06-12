---
title: Kubernetes学习笔记一：Kubernetes Namespace与Label
published: 2023-10-19
pinned: false
description: Kubernetes Namespace与Label的基本概念、定义和使用
tags: [Kubernetes]
category: 容器
draft: false
---

#  Kubernetes Namespace
## Namespace 的用途
1. 实现资源隔离 - 用以实现不同租户/团队的资源分隔
2. 多环境部署 - 设定 Dev，Test 等 Namespace，将不同部署环境进行分隔
3. 微服务部署 - 将应用拆分为多个独立模块，通过独立的 Namespace 进行分隔
4. 安全和合规性

## Namespace 的实现原理
1. 每个 Namespace 都是 Kubernetes 下的一个虚拟集群，其内部包含的资源（Pod，Service，Volume 等）只能在该 Namespace 下使用
2. Kubernetes API server 使用 etcd 存储资源对象的元数据，每一个 Namespace 拥有一个独立的 etcd 存储空间
3. 在 Kubernetes 运行时，每个 Namespace 下的资源都被分配一个唯一标识符，并与该 Namespace 的标识符相关联，因此不同 Namespace 下的同名资源对象不冲突
4. Kubernetes Scheduler 根据不同的 Namespace 将 Pod 调度到节点
5. Kubernetes DNS 插件为每个 Namespace 创建一个 DNS 域名，用于解析该 Namespace 下的所有 Service 域名

## 基础使用
1. 查看全部 Namespace

```bash
kubectl get ns
```

2. 创建与删除 Namespace

```bash
# 创建
kubectl create ns test_ns
# 删除
kubectl delete ns test_ns
```

3. 使用 Yaml 文件创建 Namespace

```yaml
# 快速创建模板：kubectl create ns test --dry-run -o yaml > test_ns.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: test_ns
```

4. 切换命名空间

```bash
kubectl config set-context --current --namespace=kube-system
```

5. 查看哪些资源是命名空间级别的

```bash
kubectl api-resources --namespaced=true
```

## Namespace 资源配额
### 常见的资源配额
1. CPU 配额 - 限制一个 Namespace 下所有 Pod 使用的 CPU 额度
2. 内存配额 - 限制一个 Namespace 下所有 Pod 使用的内存额度
3. 存储配额 - 限制一个 Namespace 下所有 PVC 使用的存储额度
4. Pod 配额 - 限制 Namespace 下可运行的 Pod 的最大数量
5. 服务配额 - 限制 Namespace 下可运行的 service 的最大数量

### 启动资源配额
1. 检查集群是否启用了资源配额

```bash
cat /etc/kubernetes/manifest/kube-apuserver.yaml | grep enable-admission-plugins
```

2. 如果没有，为其增加 ResourceQuota

```bash
- --enable-admission-plugins=NodeRestriction, ResourceQuota
```

### 配额机制支持的资源类型
[https://kubernetes.io/zh-cn/docs/concepts/policy/resource-quotas/](https://kubernetes.io/zh-cn/docs/concepts/policy/resource-quotas/)

### 声明资源限额
```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: example-quota
  namespace: test-quota
spec:
  hard:
    pods: "5"
    services: "3"
    requests.cpu: "1"
    requests.memory: 1Gi
    limits.cpu: "1"
    limits.memory: 1Gi
```

# Kubernets Label
## 基础使用
1. 创建标签

```bash
kubectl label 资源类型 名称 <label-key1>=<label-value1> <label-key2>=<label-value2>
```

或者在创建资源时使用 --labels 参数直接定义

```bash
kubectl run web-nginx --image=nginx:latest --labels=version=test
```

2. 删除标签

```bash
kubectl label 资源类型 名称 <label-key>-
```

3. 查看标签

```bash
kubectl get 资源类型 名称 --show-labels
```

## 根据标签过滤资源
1. 指定 Key=value

```bash
kubectl get pods -l env=test
```

2. 根据 key 名称显示资源

```bash
kubectl get pods -L env
```

3. 根据标签删除资源

```bash
kubectl delete pods -l env=xxx
```

