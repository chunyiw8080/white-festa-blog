---
title: Kubernetes学习笔记九：Kubernetes 数据存储持久化
published: 2024-06-11
pinned: false
description: 介绍了Kubernetes中几种数据持久化的方法
tags: [Kubernetes]
category: 容器
draft: false
---

# EmptyDir 空目录存储
## 介绍
EmptyDir 是 Kubernetes 中的持久性存储卷，它可以在 Pod `生命周期内`持久化保存数据。

当容器使用 EmptyDir 时，Kubernetes 会在节点上为其分配一个空目录。在 Pod 的生命周期内，此目录一直存在，可以在容器之间共享，即使 Pod 重启，数据也保持不变。

然而，EmptyDir 仅支持在`单个节点`上持久化存储，如果该节点故障或 Pod 迁移到其他节点，数据会丢失。

## 使用
1. 声明资源清单文件

```yaml
apiVersion: v1
kind: Pod
metadata:
  labels:
    run: pod-empty
  name: pod-empty
spec:
  containers:
  - name: pod-empty
    image: nginx:latest
    ports:
    - containerPort: 80
    volumeMounts:
    - name: empty-volume
      mountPath: /cache # 将下面声明的EmptyDir挂载到容器中的/cache目录
  volumes:
  - name: empty-volume
    emptyDir: {}
  restartPolicy: Always
```

2. 应用配置
3. 验证挂载
    1. 首先获取 pod 的 uid

```bash
[root@microk8s-85 /opt/tutorial/storage/emptydir]#kubectl get pod pod-empty -o yaml | grep uid
  uid: 9c594be2-3cef-4e1e-94ff-cb0d3133c3bd
```

    2. 查看`/var/lib/kubelet/pods/$POD_UID/volumes`目录可以看到挂载到容器中的目录

```bash
[root@microk8s-85 /opt/tutorial/storage/emptydir]#tree /var/lib/kubelet/pods/9c594be2-3cef-4e1e-94ff-cb0d3133c3bd/
/var/lib/kubelet/pods/9c594be2-3cef-4e1e-94ff-cb0d3133c3bd/
├── containers
│   └── pod-empty
│       └── abf0e2bd
├── etc-hosts
├── plugins
│   └── kubernetes.io~empty-dir
│       ├── empty-volume
│       │   └── ready
│       └── wrapped_kube-api-access-xcsj6
│           └── ready
└── volumes
    ├── kubernetes.io~empty-dir
    │   └── empty-volume
    │       └── test-empty-dir
    └── kubernetes.io~projected
        └── kube-api-access-xcsj6
            ├── ca.crt -> ..data/ca.crt
            ├── namespace -> ..data/namespace
            └── token -> ..data/token

11 directories, 8 files
```

# hostPath 存储卷
## 介绍
hostPath 是Kubernetes 中一种简单的持久性存储卷类型，它可将节点的文件系统中的文件或目录直接挂载到Pod 中。

该卷类型通过在Pod 中指定主机路径和容器中所需挂载该路径的位置来工作。它适用于需要访问节点中文件系统上的目录或文件的应用程序。

需要注意的是，使用hostPath 存储卷需要非常小心，因为它会直接暴露节点的文件系统。另外，当Pod 迁移到其他节点时，这个目录映射不会跟随迁移而改变，因此可能会影响到应用程序的可移植性。

## 语法与参数
1. `path`：主机上目录的路径。如果路径是符号链接，它将链接到真实路径
2. `type`：主机默认卷的类型。可选值：
    1. `DirectoryOrCreate`：如果指定的目录不存在，就自动创建一个空目录，权限设置为`0755`，与kubelet 具有相同的组和所有权。
    2. `Directory`：表示将使用现有主机上的目录。给定的目录必须存在。
    3. `FileOrCreate`：如果在主机上指定的文件不存在，则创建一个该空文件，权限设置为`0644`，与kubelet 具有相同的组和所有权。否则将使用现有文件。
    4. `File`：表示将使用现有主机上的文件。给定的文件必须存在
    5. `Socket`：表示使用主机上的Unix 套接字文件。必须存在。
    6. `CharDevice`：表示使用主机上的字符设备文件。必须存在。
    7. `BlockDevice`：表示使用主机上的块设备文件。必须存在。

## 使用
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: test-hostpath
spec:
  containers:
  - name: test-nginx
    image: nginx
    volumeMounts:
    - name: test-volume
      mountPath: /test-nginx
      
  - name: test-tomcat
    image: tomcat:8.5-jre8-alpine
    volumeMounts:
    - name: test-volume
      mountPath: /test-tomcat 
      
  volumes:
  - name: test-volume
    hostPath:
      path: /data1 # 宿主机上要挂载到容器中的目录
      type: DirectoryOrCreate # 类型：如果指定的目录不存在，就自动创建一个空目录
```

# NFS 存储卷
## 部署 NFS
1. 安装 NFS 服务器

```bash
dnf install -y nfs-utils
```

2.  启动并设置服务开机自启 

```bash
systemctl enable --now nfs-server
```

3.  创建共享目录 

```bash
mkdir -p /nfs/data
chown nobody:nobody /nfs/data
chmod 777 /nfs/data
```

4.  配置 NFS 共享 

```bash
echo "/srv/nfs/kubedata 192.168.56.0/24(rw,sync,no_subtree_check,no_root_squash)" >> /etc/exports
```

5. 应用配置

```bash
exportfs -rav
```

输出：

```bash
[root@nfs-13 /nfs/data]#sudo exportfs -rav
exporting 10.0.0.0/24:/nfs/data
```

6. 在其他节点上验证 NFS 服务

```bash
showmount -e 10.0.0.13
```

## 声明 Kubernetes 资源清单文件
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: test-nfs
spec:
  containers:
  - name: test-nginx
    image: nginx:latest
    volumeMounts:
    - name: test-nfs-volume
      mountPath: /test-nginx
      
  volumes:
  - name: test-nfs-volume
    nfs:
      path: /nfs/data # NFS服务器上的共享目录
      server: 10.0.0.13 # NFS服务器地址
```

# 持久化存储之 PersistentVolume 和 PersistentVolumeClaim
## 定义与工作原理
### PersistentVolume (PV)
+ 在Kubernetes 中，PV（`PersistentVolume`）是一种独立于Pod 而存在，并且可以被多个Pod 共享的存储资源。PV 的创建由管理员完成，而Pod 中的容器则通过PVC（`PersistentVolumeClaim`）来申请PV 的使用权限。
+ PV 可以连接到不同种类的持久化存储后端，比如`NFS`、`iSCSI`、`AWS EBS` 等，以提供Kubernetes 中的持久性存储。在Pod 和PV 之间需要PVC 来进行匹配，以保证Pod 能够获取到需要的PV 资源。
+ 在PV 中，管理员可以定义各种存储相关的参数，包括`存储类别`、`访问模式`、`存储容量`等等。PVC 需要提供的信息则包括`需要的存储容量`、`访问模式`等，只有满足这些条件的PV 才能被绑定到PVC 上面，并能够被Pod 访问。
+ 由于PV 是独立于Pod 的资源对象，在多个Pod 之间共享数据变得非常简便。使用PV 还可以使数据得到持久化，这样便可以在Pod 被迁移或升级时，保留已有的数据文件。
+ 总之，PV 提供了Kubernetes 集群中持久性存储的完整抽象层次，并为Pod提供了访问PV 的接口，从而实现了数据持久化，并且能够为多个Pod 提供共享数据的能力。

### PersistentVolumeClaim (PVC)
+ 在Kubernetes 中， PVC （ `PersistentVolumeClaim` ） 用来申请使用PV（`PersistentVolume`）的存储资源。PVC 是一个表示Pod 中容器需要的持久化存储的逻辑卷，它声明了需要的存储资源及访问模式，Kubernetes 集群会为它自动匹配可用的PV 资源。
+ PVC 的申请过程可以理解为Pod 容器与实际存储之间的“中介”机制。在Pod的生命周期中，容器会需要持久化存储来保存数据。PVC 允许应用程序声明自己需要使用一定数量的存储空间，并定义访问存储的模式。
+ PVC _<u>可以跨命名空间使用</u>_，但_<u>只能匹配同一命名空间中的PV</u>_。如果希望PVC可以访问某个特定的PV 资源，那么PVC 的规格必须与该PV 资源的规格_<u>完全匹配</u>_。
+ 如果PV 规格中包含的存储空间或访问模式不满足PVC 规格中声明的需求，则PVC将无法匹配到该PV。
+ 当Pod 容器需要使用持久化存储时，可以通过PVC 申请使用PV 资源。Kubernetes 集群会为PVC 寻找一个合适的PV 资源并将其分配给该PVC。Pod 容器在启动时，只需要将该PVC 挂载到预定目录即可使用PV 提供的持久化存储服务。
+ 总之，PVC 为Kubernetes 内的Pod 容器提供了管理存储卷的方式，通过声明式的方法为Pod 引入了新的持久存储块。它将对存储资源的请求隔离开来，无需在Pod 定义中耦合具体的存储参数细节，并优化了资源的灵活使用和管理。

### PVC 和PV 的绑定
+ 用户创建 pvc 并指定需要的资源和访问模式。在找到可用 pv 之前，pvc 会保持未绑定状态。绑定是通过PVC 规范中的`spec.selector` 字段实现的，它用于绑定与 pvc 要求最接近的 pv。
+ pvc 和 pv 它们是一一对应的关系，pv 如果被pvc 绑定了，就不能被其他pvc使用了。
+ 在创建pvc 的时候，应该确保和底下的 pv 能绑定，如果没有合适的 pv，pvc 就会处于pending 状态。

### Pod 与PVC 的挂载
随着 PVC 和PV 的绑定，管理员将把 PV 暴露给Kubernetes 中的 Pods。Pod 指定 PVC 名称，Kubernetes 确定哪个PVC 绑定了哪个PV，并将PV 添加到Pod的文件系统中。Pod 然后在容器中挂载PV，以使容器可以访问它。

### 回收策略
当创建 pod 时如果使用pvc 做为存储卷，它会和 pv 绑定，当删除 pod，pvc 和 pv 绑定就会解除，解除之后和pvc 绑定的 pv 卷里的数据有几种处理方式：可以保留，回收或删除，即 Retain、Recycle（不推荐使用，1.15被废弃了）、Delete。

+ Retain

当删除pvc 的时候，pv 仍然存在，处于released 状态，但是它不能被其他 pvc 绑定使用，里面的数据还是存在的，当我们下次再使用的时候，数据还是存在的，这个是默认的回收策略。

+ Delete

删除pvc 时即会从Kubernetes 中移除PV，也会从相关的外部设施中删除存储资产。

## 语法与字段说明
### PersistentVolume
|  字段名  |  类型  |  必选  |  取值  |
| --- | --- | --- | --- |
| `spec.accessModes` | []string | | `ReadWriteOnce`（RWO）：可被单个节点以读写方式挂载；该模式要求PV/PVC 只能被一个节点以读写方式挂载。这意味着，当PV/PVC 与Pod 绑定时，Pod 可以在`一个节点上以读写模式`使用该PV/PVC，但不允许在其他节点上以相同方式使用。<br/>`ReadOnlyMany`（ROX）：可被多个节点以只读方式挂载；该模式要求PV/PVC 能够被多个节点以只读方式挂载。这意味着，当PV/PVC 与Pod绑定时，Pod 可以在`多个节点上以只读模式`使用该PV/PVC，但不允许在任何一个节点上进行写操作。<br/>`ReadWriteMany`（RWX）：可被多个节点以读写方式挂载；该模式要求PV/PVC 可以被多个节点以读写方式挂载。这意味着，当PV/PVC 与Pod 绑定时，Pod 可以在`多个节点上以读写模式`使用该PV/PVC。 |
| `spec.capacity` | map[string]<br/>string | | 用于指定PV 或PVC 的存储容量大小。该字段必须是以字符串形式指定的数字，并附带相应的单位（如`Gi`、`G`、`Mi`、`M` 等）。<br/>例如，要在PV 上定义1GiB 的存储容量，可以设置`spec.capacity.storage`字段为1Gi。 |
| `persistentVolumeReclaimPolicy` | string | | `PersistentVolume.spec.persistentVolumeReclaimPolicy `是指在删除使用完的PersistentVolume（PV）后，PV 上残留的数据应该如何处理的策略。这个策略可以在PV 创建时指定。<br/>可用参数：<br/>`Retain`：默认策略，保留PersistentVolume 删除之后的数据，不进行再利用。需要手动清理PV 上的数据。<br/>`Recycle`：自动清空PersistentVolume 上面的数据，PV 又可以重复使用。可进行标准的文件系统格式化和清空操作，但不适用于多个PV 共享的场景。<br/>`Delete`：直接删除PersistentVolume。PV 上的数据会被同步删除。 |


### PersistentVolumeClaim
|  字段名  |  类型  |  必选  |  取值  |
| --- | --- | --- | --- |
| `accessModes` | []string | √ | 指定访问模式。 |
| `resources` | resources | √ | 用于指定PV 或PVC 的存储容量大小。 |
| `resources.limits` | map[string]string |  | 限制允许请求的最大容量大小。 |
| `resources.requests` | map[string]string |  | 请求所需的最小资源量。也就是最小容量 |
| `volumeMode` | string |  | 用于指定PV 和PVC 的卷模式。卷模式决定了卷内的内容如何被呈现给容器。<br/>Kubernetes 目前支持两种卷模式：<br/>`Filesystem`：该模式表示卷将被格式化为一个文件系统，并作为常规挂载点提供给容器。这是默认的卷模式。<br/>`Block`：该模式表示卷被格式化为一个块设备卷，通常用于需要性能较高且需要显式控制块设备的应用程序。 |
| `volumeName` | string |  | 用于引用现有的PersistentVolume（PV），即将该PVC 绑定到指定的PV 上。请求的访问模式和存储容量大小必须要和pv 匹配上，否则指定了PV 进行绑定，也会绑定失败。 |


## 示例
### 创建 PersistentVolume
```yaml
apiVersion: v1
kind: PersistentVolume
metadata:
  name: test-pv
spec:
  capacity:
    storage: 1Gi
  accessModes: ["ReadOnlyMany"]
  nfs:
    path: /nfs/data
    server: 10.0.0.13
```

### 创建PersistentVolumeClaim
```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: test-pvc
spec:
  accessModes: ["ReadOnlyMany"]
  resources:
    requests:
      storage: 1Gi
  # mircok8s默认使用microk8s-hostpath作为动态存储类，因此需要手动声明storageClassName为空以匹配之前创建的PV
  storageClassName: ""
```

### 在 Pod 中使用 PVC
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: test-pvpvc-pod
spec:
  containers:
  - name: test-nginx
    image: nginx
    volumeMounts:
    - name: nginx-html
      mountPath: /usr/share/nginx/html
      
  volumes:
  - name: nginx-html
    persistentVolumeClaim:
      claimName: test-pvc
```

# StorageClass 存储类
## 什么是 StorageClass
PV 和PVC 模式都是需要先创建好PV，然后定义好PVC 和pv 进行一对一的Bound（绑定），但是如果PVC 请求成千上万，那么就需要创建成千上万的PV，对于运维人员来说维护成本很高，Kubernetes 提供一种自动创建PV 的机制，叫StorageClass，它的作用就是创建PV 的模板。k8s 集群管理员通过创建storageclass 可以动态生成一个存储卷pv 供k8s pvc 使用

具体来说，StorageClass 会定义以下两部分：

1. PV 的属性，比如存储的大小、类型等。
2. 创建这种PV 需要使用到的存储插件，比如Ceph、NFS 等。

有了这两部分信息，Kubernetes 就能够根据用户提交的PVC，找到对应的StorageClass，然后Kubernetes 就会调用StorageClass 声明的存储插件，创建出需要的PV。

## 存储制备器 Provisioner
每个 StorageClass 都有一个制备器（Provisioner），用来决定使用哪个卷插件制备 PV。 该字段必须指定。

| 卷插件| 内置制备器 | 配置示例 |
| :--- | :---: | :---: |
| AzureFile  | ✓  | [ Azure File ](https://kubernetes.io/zh-cn/docs/concepts/storage/storage-classes/#azure-file) |
| CephFS  | - | - |
| FC  | -  | -  |
| FlexVolume  | -  | -  |
|  iSCSI  |  -  |  -  |
|  Local  |  -  | [ Local ](https://kubernetes.io/zh-cn/docs/concepts/storage/storage-classes/#local) |
|  NFS  |  -  | [ NFS ](https://kubernetes.io/zh-cn/docs/concepts/storage/storage-classes/#nfs) |
|  PortworxVolume  |  ✓  | [ Portworx Volume ](https://kubernetes.io/zh-cn/docs/concepts/storage/storage-classes/#portworx-volume) |
|  RBD  |  ✓  | [ Ceph RBD ](https://kubernetes.io/zh-cn/docs/concepts/storage/storage-classes/#ceph-rbd) |
|  VsphereVolume  |  ✓  | [ vSphere ](https://kubernetes.io/zh-cn/docs/concepts/storage/storage-classes/#vsphere) |


provisioner 打对勾的表示可以由内部供应商提供，也可以由外部供应商提供。

如果是外部供应商可以参考如下提供的方法创建：

[GitHub - kubernetes-retired/external-storage: [EOL] External storage plugins, provisioners, and helper libraries](https://github.com/kubernetes-retired/external-storage)

[GitHub - kubernetes-sigs/sig-storage-lib-external-provisioner](https://github.com/kubernetes-sigs/sig-storage-lib-external-provisioner)

## 实战：使用NFS provisioner 动态生成PV
### NFS-Subdir-External-Provisioner 简介
`NFS-Subdir-External-Provisioner` 是Kubernetes 中的一个应用程序，它可以自动为一个或多个Kubernetes Persistent Volume Claims（PVCs）创建NFS 共享，并将它们挂载到相应的Pod 中。这个程序主要是为了解决Kubernetes 环境中动态PV 创建的问题。使用这个程序可以大大降低PV 的管理配置工作量。

该程序通过监控Kubernetes 的StorageClasses 和PersistentVolumeClaims 资源，自动创建和删除 PersistentVolum 资源。这个程序使用了NFS 共享服务器提供的卷。当一个PVC 请求被创建时，该程序会新建一个与其相容的PV，并将其插入到Kubernetes PersistentVolume 树中。当PVC 资源被删除时，将会自动删除PV 资源。

GitHub 地址：

[GitHub - kubernetes-sigs/nfs-subdir-external-provisioner: Dynamic sub-dir volume provisioner on a remote NFS server.](https://github.com/kubernetes-sigs/nfs-subdir-external-provisioner)

### 步骤
#### 创建运行nfs-provisioner 需要的sa 账号
```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: nfs-client-provisioner
  namespace: default
```

这是一个Kubernetes ServiceAccount 的YAML 文件，用于创建一个名为nfs-client-provisioner 的服务帐户，并将其部署到名为default 的命名空间中。

serviceaccount 是为了方便Pod 里面的进程调用Kubernetes API 或其他外部服务而设计的。

在创建Pod 的时候指定serviceaccount，那么当Pod 运行后，他就拥有了我们指定账号的权限了。

#### 对sa 授权
```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: nfs-client-provisioner-runner
rules:
  - apiGroups: [""]
    resources: ["nodes"]
    verbs: ["get", "list", "watch"]
  - apiGroups: [""]
    resources: ["persistentvolumes"]
    verbs: ["get", "list", "watch", "create", "delete"]
  - apiGroups: [""]
    resources: ["persistentvolumeclaims"]
    verbs: ["get", "list", "watch", "update"]
  - apiGroups: ["storage.k8s.io"]
    resources: ["storageclasses"]
    verbs: ["get", "list", "watch"]
  - apiGroups: [""]
    resources: ["events"]
    verbs: ["create", "update", "patch"]
---
kind: ClusterRoleBinding
apiVersion: rbac.authorization.k8s.io/v1
metadata:
  name: run-nfs-client-provisioner
subjects:
  - kind: ServiceAccount
    name: nfs-client-provisioner
    namespace: default
roleRef:
  kind: ClusterRole
  name: nfs-client-provisioner-runner
  apiGroup: rbac.authorization.k8s.io
---
kind: Role
apiVersion: rbac.authorization.k8s.io/v1
metadata:
  name: leader-locking-nfs-client-provisioner
  namespace: default
rules:
  - apiGroups: [""]
    resources: ["endpoints"]
    verbs: ["get", "list", "watch", "create", "update", "patch"]
---
kind: RoleBinding
apiVersion: rbac.authorization.k8s.io/v1
metadata:
  name: leader-locking-nfs-client-provisioner
  namespace: default
subjects:
  - kind: ServiceAccount
    name: nfs-client-provisioner
    namespace: default
roleRef:
  kind: Role
  name: leader-locking-nfs-client-provisioner
  apiGroup: rbac.authorization.k8s.io
```

+ 首先是一个ClusterRole YAML 文件，它定义了nfs-client-provisioner-runner 角色，可以访问一些资源，比如节点、持久化卷、持久化卷声明、存储类和事件，并且可以执行查看和监听操作。除此之外还可以创建、删除、更新、补丁操作和更新PV。
+ 接下来是一个ClusterRoleBinding YAML 文件， 它将上述角色绑定到nfs-client-provisioner Service Account。接下来是一个Role YAML 文件，它定义了leader-locking-nfs-client-provisioner角色，该角色具有get、list、watch、create、update 和patch 操作的权限。
+ 最后，是一个RoleBinding YAML 文件，它将上述角色绑定到nfs-client-provisionerService Account。

#### 安装nfs-provisioner 程序
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nfs-client-provisioner
  labels:
    app: nfs-client-provisioner
  namespace: default
spec:
  replicas: 1
  strategy:
    type: Recreate
  selector:
    matchLabels:
      app: nfs-client-provisioner
  template:
    metadata:
      labels:
        app: nfs-client-provisioner
    spec:
      serviceAccountName: nfs-client-provisioner
      containers:
        - name: nfs-client-provisioner
          image: registry.k8s.io/sig-storage/nfs-subdir-external-provisioner:v4.0.2
          volumeMounts:
            - name: nfs-client-root
              mountPath: /persistentvolumes
          env:
            - name: PROVISIONER_NAME
              value: kubernetes.test/nfs
            - name: NFS_SERVER
              value: 10.0.0.13
            - name: NFS_PATH
              value: /nfs/data
      volumes:
        - name: nfs-client-root
          nfs:
            server: 10.0.0.13
            path: /nfs/data
```

#### 创建storageclass，动态供给pv
```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: nfs-storage
provisioner: kubernetes.test/nfs
parameters:
  archiveOnDelete: "true"
```

#### 创建 PVC，自动获取 PV 分配
```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: test-pvc
spec:
  accessModes: ["ReadWriteMany"]
  resources:
    requests:
      storage: 1Gi
  storageClassName: nfs-storage
```

在创建 PVC 后，观察 kubelet 事件可以发现

```yaml
LAST SEEN   TYPE     REASON                 OBJECT                           MESSAGE
0s          Normal   ExternalProvisioning   PersistentVolumeClaim/test-pvc   Waiting for a volume to be created either by the external provisioner 'kubernetes.test/nfs' or manually by the system administrator. If volume creation is delayed, please verify that the provisioner is running and correctly registered.

0s          Normal   Provisioning           PersistentVolumeClaim/test-pvc   External provisioner is provisioning volume for claim "default/test-pvc"

0s          Normal   ProvisioningSucceeded   PersistentVolumeClaim/test-pvc   Successfully provisioned volume pvc-9984fc2a-bfa7-4aca-8901-7f273174392f

0s (x2 over 0s)   Normal   ExternalProvisioning    PersistentVolumeClaim/test-pvc   Waiting for a volume to be created either by the external provisioner 'kubernetes.test/nfs' or manually by the system administrator. If volume creation is delayed, please verify that the provisioner is running and correctly registered.
```

