---
title: Kubernetes Label与分层模型
published: 2025-06-09
pinned: false
description: 如何更好的使用kubernetes label管理工作资源，使用基于服务身份、组织/管理维度与发布维度的分层模型
tags: [Kubernetes]
category: 容器
draft: false
---

# 三个 Labels 相关字段
分别是 `metadata.labels`，`spec.template.metadata.labels` 和 `spec.selector.matchlabels`  

## 区别
| 位置 | 属于谁 | 作用 |
| --- | --- | --- |
| `metadata.labels` | Deployment / Service 本身 | 标识“这个对象是什么” |
| `spec.template.metadata.labels` | **Pod** | **真正打在 Pod 上的标签** |
| `spec.selector.matchLabels` | Deployment | 声明具有哪些标签的Pod被此Deployment所管理 |

也就是说

```bash
kubectl get pods --show-labels = spec.template.metadata.labels 

kubectl get deployments --show-labels = metadata.labels  
```

另外，在创建Deployment Manifest时，spec.template.metadata.labels与spec.selector.matchLabels必须相等，否则apply会失败，因为Pod与Deployment没有建立起耦合关系。



## Service 的 Selector 选择的是哪个 Label？
```yaml
kind: Service
spec:
  selector:
    app: myapp
    version: blue
```

其行为是等价于查找所有 Pod 中， `spec.template.metadata.labels`存在 `app=myapp`,`version=blue` 的 Pod。

# 标签分层模型
## 服务身份 - 稳定
```yaml
app: myapp
```

##  发布维度 - 会变
```yaml
version: v1 / v2 / canary
```

##  管理 / 组织维度  
```yaml
owner: team-a
env: prod
```

## 使用
+ Pod: 1+2
+ Deployment selector: 1+2
+  Deployment metadata: 1+3
+  Service selector: 1 或  1+2，取决于是否要做蓝绿部署

