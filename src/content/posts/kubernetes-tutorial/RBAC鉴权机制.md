---
title: Kubernetes学习笔记十二：Kubernetes RBAC鉴权机制
published: 2024-09-02
pinned: false
description: 在Kubernetes中通过RBAC鉴权机制实现对工作资源的权限控制
tags: [Kubernetes]
category: 容器
draft: false
---

#  RBAC 概述
## 什么是RBAC？
RBAC 是一种最常用的访问控制解决方案，它通过将用户分配到角色，将角色分配给权限实体，从而定义了哪些用户可以访问哪些资源，以及在资源上执行哪些操作。简单来说，RBAC 允许对不同的用户或组分配不同的权限，以实现资源的安全管理。

在Kubernetes 中，RBAC 用于控制对API 对象的访问权限，可以限制对集群资源的访问，例如容器、节点、服务以及部署等。

## RBAC 的主要组件
+ `Role`：定义权限的具体内容，例如获取、创建、修改或删除某个对象。
+ `ClusterRole`：在整个集群中定义权限。
+ `RoleBinding`：将Role 绑定到用户或组，即为用户授权。
+ `ClusterRoleBinding`：将`ClusterRole` 绑定到用户或组，即为用户授权。

其中， `Role` 和`RoleBinding` 控制访问一个 namespace 中的资源，`ClusterRole` 和`ClusterRoleBinding` 控制访问整个集群中的资源。

## 认证、授权、准入控制
Kubernetes 中的RBAC（基于角色的访问控制）机制提供了三个方面的控制：

### 认证
认证即控制用户身份的验证工作，Kubernetes 通过使用`OAuth2`、`OpenIDConnect`、`TLS` 等协议来进行客户端身份认证。

kubernetes 主要通过APIserver 对外提供服务， 那么就需要对访问apiserver 的用户做认证，如果任何人都能访问apiserver，那么就可以随意在k8s 集群部署资源，这是非常危险的，也容易被黑客攻击渗透，所以需要我们对访问k8s 系统的apiserver 的用户进行认证，确保是合法的符合要求的用户。

#### 提供了三种认证方式
1. 客户端认证

客户端认证也称为双向TLS 认证，kubectl 在访问apiserver 的时候，apiserver 也要认证kubectl 是否是合法的，他们都会通过ca 根证书来进行验证

2. Bearertoken

Bearertoken 的方式，可以理解为apiserver 将一个密码通过了非对称加密的方式告诉了kubectl，然后通过该密码进行相互访问。

kubectl 访问k8s 集群，要找一个config 文件，基于config 文件里的用户访问kube-apiserver。

3. ServiceAccount

客户端ca 证书认证和Bearertoken 的两种认证方式，都是外部访问kube-apiserver 的时候使用的方式，Serviceaccount 是内部访问pod 和kube-apiserver 交互时候采用的一种方式。

Serviceaccount 包括：namespace、token、ca，且通过目录挂载的方式给予pod，当pod 运行起来的时候，就会读取到这些信息，从而使用该方式和kube-apiserver 进行通信

### 授权
授权即控制用户能够访问的资源和操作，使用RBAC 以及其他方式来实现。

在授权方面，Kubernetes 使用RBAC 提供了细粒度的授权，它通过`Role` 和`Role Binding`，`ClusterRole` 和`ClusterRoleBinding` 四个重要组件来定义访问控制策略，使得管理员可以很好地控制集群中各个用户或组的相对权限。

#### 用户基于rolebinding 绑定到role
限定在rolebinding 所在的名称空间：

#### 用户基于rolebinding 绑定到clusterrole
假如有6 个名称空间，每个名称空间的用户都需要对自己的名称空间有管理员权限，那么需要定义6 个role 和rolebinding，然后依次绑定，如果名称空间更多，我们需要定义更多的role，这个是很麻烦的，所以我们引入clusterrole，定义一个clusterrole ， 对clusterrole 授予所有权限， 然后用户通过rolebinding 绑定到clusterrole，就会拥有自己名称空间的管理员权限了。

#### Role 与 ClusterRole 的区别
| 对比项 | `Role` | `ClusterRole` |
| --- | --- | --- |
| 可作用范围 | **单个命名空间** | 所有命名空间，甚至是集群范围 |
| 是否可绑定到多个命名空间 | ❌ 否，必须每个命名空间单独创建 | ✅ 可以通过多个 `RoleBinding` 绑定到不同命名空间 |
| 是否能访问非命名空间资源（如 Node） | ❌ 不能 | ✅ 可以访问所有资源，包括非 namespaced 资源 |
| 是否推荐在多个 namespace 使用 | ❌ 不推荐 | ✅ 推荐：写一次，绑定多次 |


#### 用户基于clusterrolebinding 绑定到clusterrole
ClusterRoleBinding 绑定到 ClusterRole 上，该用户对任何命名空间都拥有 ClusterRole 所定义的权限

### 准入控制
#### 什么是准入控制？
准入控制即对用户请求进行检查，以确保它们符合Kubernetes 集群的条件和策略。准入控制包括各种策略和机制，如网络策略、pod、服务端点生成、限制pod 的资源使用、入站和出站流量等等。

准入控制器会在请求通过认证和鉴权之后，对象被持久化之前拦截到达kube-apiserver 服务的请求。

准入控制器可以限制创建、删除、修改对象的请求。准入控制器不会阻止读取（get、watch 或list）对象的请求

在准入控制方面，Kubernetes 提供了一系列的 admission 控制器，如`NamespaceLifecycle` 、`LimitRanger` 、`ResourceQuota` 、`PodSecurityPolicy` 、`ServiceAccount` 等等，通过启用或禁用这些控制器来限制Kubernetes 对象的创建、修改和删除，从而进一步提高了安全性。

#### 准入控制阶段
准入控制过程分为两个阶段。第一阶段，运行变更准入控制器。第二阶段，运行验证准入控制器。某些控制器既是变更准入控制器又是验证准入控制器。

如果两个阶段之一的任何一个控制器拒绝了某请求，则整个请求将立即被拒绝，并向最终用户返回错误。

#### 如何启用一个准入控制器？
Kubernetes API 服务器的 `enable-admission-plugins` 参数表示开启的（以逗号分隔的）准入控制插件列表，这些插件会在集群修改对象之前被调用。

```bash
[root@k8s-master01 ~]# cat /etc/kubernetes/manifests/kube-apiserver.yaml
...
spec:
  containers:
  - command:
    ...
    - --enable-admission-plugins=NodeRestriction
    ...
```

可以查看如下官网网址，来确认你需要启用的准入控制器：

[Kubernetes 中的准入控制](https://kubernetes.io/zh-cn/docs/reference/access-authn-authz/admission-controllers/)

# UserAccount 与 ServiceAccount
## UserAccount
UserAccount 是给kubernetes 集群外部用户使用的，例如运维人员或者集群管理人员，kubeadm 安装的k8s，默认用户账号是kubernetes-admin。

k8s 客户端（一般用kubectl）访问kube-apiserver 组件。kube-apiserver 需要对客户端做认证，使用kubeadm 安装的K8s，会在用户家目录下创建一个认证配置文件.kube/config 这里面保存了客户端访问

kube-apiserver 的密钥相关信息，这样当用kubectl 访问k8s 时，它就会自动读取该配置文件，向kube-apiserver 发起认证，然后完成操作请求。

## ServiceAccount
ServiceAccount 是Pod 使用的账号， Pod 容器的进程需要访问kube-apiserver 时用的就是ServiceAccount 账户。

ServiceAccount 仅局限它所在的namespace 命名空间，每个namespace 创建时都会自动创建一个`default service account`。创建Pod 时，如果没有指定Service Account，Pod 则会使用default Service Account

### 常见应用场景
+ 安全访问Kubernetes API

管理员可以创建一个有限的、能够访问Kubernetes API 的ServiceAccount 来授权操作，从而减少了意外修改或意外删除Kubernetes 资源的风险。这可以通过把ServiceAccount的访问权限限制到仅适用于特定命名空间或资源上实现。

+ 微服务架构中的访问控制

在应用服务采用微服务架构时，每个服务都需要独立的访问授权，这通常涉及在服务之间传递访问令牌。将每个服务的访问令牌存储在ServiceAccount 中，能够更好的隔离每个服务，并精确控制对API 访问的权限。

+ 容器中的自动化API 访问

可以通过创建一个具有访问API 权限的ServiceAccount，运行在容器内的进程就可以使用该ServiceAccount 直接访问Kubernetes API，从而允许容器自动调整自己的资源、存储、安全以及服务发现等方面。

+ 在CI/CD 中自动迭代资源

通过使用create、apply 和delete 操作等Kubernetes API 服务，ServiceAccount 可以在CI/CD 流水线中自动更新Kubernetes 资源，如部署、配置映射和服务等。

## ServiceAccount 应用
### 创建 serviceaccount 并使用其访问集群 apiserver
1. 创建 ServiceAccount

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: sa-web
  namespace: default
  labels:
    sa: sa-web
```

或者使用命令行

```bash
kubectl create sa sa-web
```

2. 创建 Pod 并设置 sa-web 为它的 ServiceAccount

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: sa-web-pod
  namespace: default
  labels:
    app: sa-web-pod
spec:
  serviceAccountName: sa-web
  containers:
  - name: nginx
    ports:
    - containerPort: 80
    image: nginx:latest
    imagePullPolicy: IfNotPresent
```

3. 进入 Pod 中并执行

```bash
cd /var/run/secrets/kubernetes.io/serviceaccount
curl --cacert ./ca.crt -H "Authorization: Bearer $(cat ./token)" https://kubernetes/api
```

4. 结果

```json
{
  "kind": "APIVersions",
  "versions": [
    "v1"
  ],
  "serverAddressByClientCIDRs": [
    {
      "clientCIDR": "0.0.0.0/0",
      "serverAddress": "10.0.0.85:16443"
    }
  ]
}
```

5. 尝试访问另一个链接

```bash
curl --cacert ./ca.crt -H "Authorization: Bearer $(cat ./token)" https://kubernetes/api/v1/namespaces/kube-system
```

结果

```json
{
  "kind": "Status",
  "apiVersion": "v1",
  "metadata": {},
  "status": "Failure",
  "message": "namespaces \"kube-system\" is forbidden: User \"system:serviceaccount:default:sa-web\" cannot get resource \"namespaces\" in API group \"\" in the namespace \"kube-system\"",
  "reason": "Forbidden",
  "details": {
    "name": "kube-system",
    "kind": "namespaces"
  },
  "code": 403
}
```

403 - 没有权限

6. 为 sa-web 授权

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: sa-web-admin
subjects:
- kind: ServiceAccount
  name: sa-web
  namespace: default
roleRef: # roleRef - 将已存在的Role或ClusterRole角色作为模板，让新角色使用这个模板获得模板的全部权限
  kind: ClusterRole
  name: cluster-admin # cluster-admin 拥有对所有资源的权限。
  apiGroup: rbac.authorization.k8s.io
```

7. 查看 ClusterRoleBinding

```bash
[root@microk8s-85 /opt/tutorial/rbac/sa]#kubectl get ClusterRoleBinding sa-web-admin
NAME           ROLE                        AGE
sa-web-admin   ClusterRole/cluster-admin   26s
```

8. 查看sa-web-admin ClusterRoleBinding 的详细信息

```bash
[root@microk8s-85 /opt/tutorial/rbac/sa]#kubectl describe ClusterRoleBinding sa-web-admin
Name:         sa-web-admin
Labels:       <none>
Annotations:  <none>
Role:
  Kind:  ClusterRole
  Name:  cluster-admin
Subjects:
  Kind            Name    Namespace
  ----            ----    ---------
  ServiceAccount  sa-web  default
```

9. 重新进入 Pod 访问刚才无权限的 apiserver 接口

```bash
curl --cacert ./ca.crt -H "Authorization: Bearer $(cat ./token)" https://kubernetes/api/v1/namespaces/kube-system
```

10. 结果

```json
{
  "kind": "Namespace",
  "apiVersion": "v1",
  "metadata": {
    "name": "kube-system",
    "uid": "660650c8-a91b-467e-bd45-4f981f61b325",
    "resourceVersion": "6",
    "creationTimestamp": "2025-05-26T05:52:15Z",
    "labels": {
      "kubernetes.io/metadata.name": "kube-system"
    },
    "managedFields": [
      {
        "manager": "kubelite",
        "operation": "Update",
        "apiVersion": "v1",
        "time": "2025-05-26T05:52:15Z",
        "fieldsType": "FieldsV1",
        "fieldsV1": {
          "f:metadata": {
            "f:labels": {
              ".": {},
              "f:kubernetes.io/metadata.name": {}
            }
          }
        }
      }
    ]
  },
  "spec": {
    "finalizers": [
      "kubernetes"
    ]
  },
  "status": {
    "phase": "Active"
  }
}
```

# Role 与 ClusterRole
## 可用字段
|  字段名  |  说明  |  可选项  |
| --- | --- | --- |
| `apiVersion` | 角色对象所使用的Kubernetes API 版本。 | rbac.authorization.k8s.io/v1 |
| `kind` | 角色对象的Kubernetes 资源类型 | Role/ClusterRole |
| `metadata.name` | 定义角色名称 | - |
| `metadata.namespace` | 定义角色所属的命名空间。 | - |
| `rules.apiGroups` | 指定资源所属的API 组，""表示核心组，核心组就是v1。 | `""` 、`apps`、`rbac.authorization.k8s.io`、`networking.k8s.io`、`autoscaling`、`metrics.k8s.io`、`apiextensions.k8s.io`  |
| `rules.resources` | 定义该角色可以访问的Kubernetes 资源类型列表。 | 基于rules.apiGroups 选择资源类型 |
| `rules.nonResourceURLs` | `ClusterRole` 特有的资源， 用于控制用户是否可以访问 **非资源类的 HTTP 路径**（比如 `/healthz`、`/metrics`、`/version` 等）   | - |
| `rules.resourceNames` | 指定的是资源的具体名字 | - |
| `rules.verbs` | 角色允许的操作列表(权限) |  `get`、`list`、`watch`、`create`、`update`、`patch`、`delete`、`deletecollection`、`impersonate`、`escalate` 、`bind` 、`use`、`updateStatus`、`updateScale `  |


## Kubernetes verbs 全部列表  
| Verb | 含义 |
| --- | --- |
| `get` | 获取某个具体资源（如：`kubectl get pod nginx-123`） |
| `list` | 获取资源列表（如：`kubectl get pods`） |
| `watch` | 监听资源变更（如：监控工具 watch pod 状态变化） |
| `create` | 创建资源（如：`kubectl create deployment`） |
| `update` | 更新资源（完整替换，等价于 PUT） |
| `patch` | 局部更新资源（如通过 JSON patch 修改） |
| `delete` | 删除资源 |
| `deletecollection` | 删除资源集合（如：`kubectl delete pods --all`） |
| `impersonate` | 以其他用户身份进行操作（用于审计、网关、认证代理） |
| `escalate` | 获取被授权的权限（通常只对 RBAC 对象起作用） |
| `bind` | 授权某用户或服务账户使用某 Role（主要用于绑定操作） |
| `use` | 使用某个资源（常用于 PodSecurityPolicy、Volume、Secret 等间接使用资源） |
| `updateStatus` | 更新资源的 `.status` 字段（例如 Operator、Controller 使用） |
| `updateScale` | 修改副本数（适用于 Deployment/StatefulSet 的缩放） |


## apiGroups 列表
| API Group | 包含资源（部分示例） |
| --- | --- |
| `""`（空字符串）等于 `v1`，但是在声明 RBAC Role 时必须使用`""` | 核心资源：`pods`, `services`, `namespaces`, `secrets`, `configmaps` 等 |
| `apps` | `deployments`, `statefulsets`, `daemonsets`, `replicasets` |
| `batch` | `jobs`, `cronjobs` |
| `rbac.authorization.k8s.io` | `roles`, `rolebindings`, `clusterroles` 等 |
| `networking.k8s.io` | `networkpolicies`, `ingresses`, `ingressclasses` |
| `autoscaling` | `horizontalpodautoscalers` |
| `metrics.k8s.io` | `nodes`, `pods`（监控指标） |
| `apiextensions.k8s.io` | `customresourcedefinitions`（CRD） |


## Role：角色
在Kubernetes 中，Role 对象表示一组权限，用于授予在特定命名空间中对Kubernetes 资源的访问权限。Role 对象授予的权限只能限制在特定命名空间中，不能横跨多个命名空间

### 示例
创建一个角色，只有对Pod 资源读取的权限

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: default-read-role
  namespace: default
rules:
- apiGroups: [""]
  resources: ["pods"]
  resourceNames: []
  verbs: ["get","watch","list"]
```

+ resources: 指的是资源的类型，如 `pod`，`deployment`，`service`
+ resourceNames: 指定的是**资源的具体名字**，比如 `my-pod`、`config-prod` 等 ，留空表示适用于所有资源

## ClusterRole：集群角色
### 概述
在Kubernetes 中，ClusterRole 定义了可以在整个集群中授予的访问控制规则。与Role 不同，ClusterRole 可以在多个命名空间中定义，使用时需要将其绑定到对应的Kubernetes 用户或服务账户上。下面是几个关于ClusterRole的相关介绍：

+ ClusterRole 是一种Kubernetes 资源类型，用于控制集群范围内的访问控制。一个ClusterRole 定义可以控制多个资源的访问权限，包括全局资源和跨命名空间的资源。
+ 与Role 类型相似，ClusterRole 也包含一个规则集列表，规定了资源和操作的权限。
+ 集群管理员可以在集群中创建和管理ClusterRole 对象，它们可以在不同命名空间中共享。
+ 要将ClusterRole 绑定到用户或服务账户上， 可以使用`ClusterRoleBinding` 对象，将ClusterRole 与指定的实体绑定起来。
+ ClusterRole 通常用于<u>控制全局操作</u>，如<u>管理节点</u>、<u>访问集群状态</u>、访问各个命名空间中的所有Pod、网络策略等。

ClusterRole 可用于以下特殊元素的授权。

+ 集群范围的资源，例如`Node`、`PV` 等。
+ 非资源型的路径，例如：`/healthz`
+ 包含全部命名空间的资源，例如Pods

### Kubernetes 集群默认存在的ClusterRole
以下是Kubernetes 中默认提供的一些ClusterRole：

+ `cluster-admin`：该ClusterRole 授予对集群的完全访问权限，可以控制任何资源，包括集群范围内的操作。
+ `admin`：该ClusterRole 授予对所有命名空间内资源的读写权限，但不能够操作集群范围内的资源。
+ `edit`：该ClusterRole 授予对所有命名空间内的资源的读写权限，但不能够操作一些集群范围内的一些资源，如节点等。
+ `view`：该ClusterRole 授予对所有命名空间内资源的只读权限，同样不能够操作集群范围内的一些资源。

### 示例
1. 创建一个 ClusterRole，可以访问集群中所有 secrets

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: secrets-read-clusterrole
rules:
- apiGroups: [""]
  resources: ["secrets"]
  verbs: ["get","watch","list"]
```

2. 读取核心组的Node 资源

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: node-read-clusterrole
rules:
- apiGroups: [""]
  resources: ["nodes"]
  verbs: ["get","watch","list"]
- apiGroups: ["metrics.k8s.io"]
  resources: ["nodes"]
  verbs: ["get","watch","list"]
```

3. 允许对非资源端点“/healthz”及其所有子路径进行GET 和POST 操作

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: health-url-clusterrole
rules:
- nonResourceURLs: ["/healthz", "/healthz/*"]
  verbs: ["get","post"]
```

# RoleBinding 和 ClusterRoleBinding
## 可用字段和语法
### 基础配置字段
| 属性路径 | 类型 | 说明 |
| --- | --- | --- |
| `apiVersion` | `string` | API 版本 |
| `kind` | `string` | 资源类型 |
| `metadata` | `object` | 元数据对象 |
| `metadata.name` | `string` | 控制器的名称 |
| `metadata.namespace` | `string` | 控制器所属的命名空间，默认值为 `default` |
| `metadata.labels[]` | `list` | 自定义标签列表 |


### roleRef 字段
在Kubernetes 中，ClusterRoleBinding 对象定义了一组Subject对象与一个Role 或ClusterRole 之间的关系。Subject 对象可以是User、Group 或ServiceAccount。而roleRef 是指定Subject对象使用的Role 或ClusterRole 的引用。

| 属性路径 | 类型 | 说明 |
| --- | --- | --- |
| `roleRef.apiGroup` | `string` | Role 或 ClusterRole 所属的 API 组，通常为 `"rbac.authorization.k8s.io"` |
| `roleRef.kind` | `string` | `Role` 或 `ClusterRole` |
| `roleRef.name` | `string` | 要绑定的 Role 或 ClusterRole 的名称，指定了一个角色集合 |


### subjects 字段
| 属性路径 | 类型 | 说明 |
| --- | --- | --- |
| `subjects[]` | `object` | 每个 subject 对象 |
| `subjects.apiGroup` | `string` | Subject 对象所属的 API 组，默认值为 `"rbac.authorization.k8s.io"` |
| `subjects.kind` | `string` | Subject 对象的类型：   • `User`：表示集群中的用户（使用用户名或 UID）   • `Group`：表示用户组（使用组名或 GID）   • `ServiceAccount`：表示服务账户 |
| `subjects.name` | `string` | `name` 的含义取决于 Subject 类型：   • `User` → 用户名或 UID   • `Group` → 组名或 GID   • `ServiceAccount` → 服务账户名称 |
| `subjects.namespace` | `string` | namespace 用于指定该对象的类型所在的命名空间。 |


## RoleBing 示例
### 将先前创建的 `default-read-role` Role 绑定给 Linux rbactest1 用户
1. 创建 RoleBinding 文件

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: default-pod-read-bind
subjects:
- kind: User
  name: rbactest1
roleRef:
  kind: Role
  name: default-read-role
  apiGroup: rbac.authorization.k8s.io
```

2. 检查

```bash
[root@microk8s-85 ~]#kubectl get rolebinding
NAME                                    ROLE                                         AGE
default-pod-read-bind                   Role/default-read-role                       19m
leader-locking-nfs-client-provisioner   Role/leader-locking-nfs-client-provisioner   8d
[root@microk8s-85 ~]#kubectl describe rolebinding default-pod-read-bind
Name:         default-pod-read-bind
Labels:       <none>
Annotations:  <none>
Role:
  Kind:  Role
  Name:  default-read-role
Subjects:
  Kind  Name       Namespace
  ----  ----       ---------
  User  rbactest1  
```

### 将view 集群角色与dev Service Account 进行绑定
1. 创建 sa

```bash
kubectl create sa dev
```

2. 创建 RoleBinding 文件

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: view-sa-binding
subjects:
- kind: ServiceAccount
  name: dev
  namespace: default
roleRef:
  kind: ClusterRole
  name: view
  apiGroup: rbac.authorization.k8s.io
```

## ClusterRoleBinding 示例
参见 [https://www.yuque.com/mangshangyue-qszkg/idkuk7/srwg5035ck5zz95v#VlDdz](#VlDdz)

# 限制不同的用户使用 kubernetes 集群
需求：限制 rbactest1 用户对 test 命名空间之外的资源的访问权限

## 创建证书
### 创建证书存放位置
```bash
mkdir -p /certs/rbactest1
cd /certs/rbactest1
```

### 创建用户私钥
```bash
openssl genrsa -out rbactest1.key 2048
```

###  创建证书签名请求文件
```bash
openssl req -new -key rbactest1.key -out rbactest1.csr -subj "/CN=rbactest1/O=dev"
```

### 拷贝 kubernetes 集群的 ca 根证书
```bash
# microk8s的根证书位置
cp /var/snap/microk8s/current/certs/ca.crt .
cp /var/snap/microk8s/current/certs/ca.key .
# kubeadm安装的集群的根证书位置
cp /etc/kubernetes/pki/ca.crt .
cp /etc/kubernetes/pki/ca.key .
```

### 颁发证书
```bash
openssl x509 -req -in rbactest1.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out rbactest1.crt -days 3650
```

## 在 kubeconfig 中新增 rbactest1 用户
### 添加用户
```bash
kubectl config set-credentials rbactest1 \
--client-certificate=./rbactest1.crt \
--client-key=./rbactest1.key \
--embed-certs=true
```

### 验证
```yaml
# [root@microk8s-85 /certs/rbactest1]#kubectl config view
apiVersion: v1
clusters:
- cluster:
    certificate-authority-data: DATA+OMITTED
    server: https://127.0.0.1:16443
  name: microk8s-cluster
contexts:
- context:
    cluster: microk8s-cluster
    user: admin
  name: microk8s
current-context: microk8s
kind: Config
preferences: {}
users:
- name: admin
  user:
    client-certificate-data: DATA+OMITTED
    client-key-data: DATA+OMITTED
- name: rbactest1
  user:
    client-certificate-data: DATA+OMITTED
    client-key-data: DATA+OMITTED

```

### 添加 rbactest1 用户的上下文
```bash
# 在microk8s中
kubectl config set-context rbactest1@kubernetes --cluster=microk8s-cluster --user=rbactest1
# 在kubeadm的集群中
kubectl config set-context rbactest1@kubernetes --cluster=kubernetes --user=rbactest1
```

## 授权
### 创建 Role 角色
```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: test-ns-full
  namespace: test
rules:
- apiGroups: [""]
  resources: ["*"]
  resourceNames: []
  verbs: ["*"]
```

### 创建 RoleBinding 文件，将权限绑定给用户
```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: test-ns-full-binding
  namespace: test
subjects:
- kind: User
  name: rbactest1
  apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: Role
  name: test-ns-full
  apiGroup: rbac.authorization.k8s.io
```



