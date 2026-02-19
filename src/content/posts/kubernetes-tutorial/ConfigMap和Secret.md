---
title: Kubernetes学习笔记十一：ConfigMap和Secret
published: 2024-08-19
pinned: false
description: 在Kubernetes中通过ConfigMap和Secret管理常规配置和敏感数据
tags: [Kubernetes]
category: 容器
draft: false
---

#  ConfigMap 概述
## 概念
在Kubernetes 中，ConfigMap 用来存储应用程序的配置信息、命令行参数、属性文件等数据，可以将这些信息和应用程序本身分离，从而方便管理和维护。

ConfigMap 是一个Kubernetes API 对象，它由一些<u>键值对</u>组成，并提供了API 来创建、更新和删除这些键值对。在存储键值对的时候，ConfigMap 支持从多种来源读取数据，如`目录`、`文件`、`命令行参数`等，从而方便用户将数据导入到 Kubernetes 集群中。

在使用ConfigMap 时，用户可以将其作为一种独立的对象在Kubernetes 中进行创建和管理。一旦创建，ConfigMap 就可以在Kubernetes 中的任何其他资源中使用，如Pod 定义、容器定义、环境变量等。用户可以通过Kubernetes API的Client 库、kubectl 工具和其他客户端工具访问和修改ConfigMap。

一种常见的ConfigMap 使用场景是在Pod 中使用环境变量来进行配置。用户可以在ConfigMap 中定义所需的属性、配置文件路径等信息，随后在Pod 定义文件中使用这些环境变量引用它们。当Pod 启动时，它会自动读取这些环境变量并使用它们来配置应用程序。

总结：

Configmap 是k8s 中的资源对象，用于保存非机密性的配置的，数据可以用key/value 键值对的形式保存，也可通过文件的形式保存。

## 应用场景
ConfigMap 的应用场景包括但不限于以下几种：

1. 配置管理：通过ConfigMap，可以将应用程序所需要的配置信息独立出来，让不同的应用程序可以共用同一个ConfigMap，避免了重复的配置信息。
2. 环境变量管理：可以将容器中的环境变量集中管理，便于维护和修改，同时可以避免暴露敏感信息。
3. 容器镜像版本管理：将容器镜像使用的配置文件打包到ConfigMap 中，每次升级镜像时都可以使用相应版本的ConfigMap。
4. 多节点部署：在多个节点上部署相同的应用程序时，可以使用ConfigMap来传递配置信息，避免重复配置。
5. 动态配置：应用程序可以通过监控ConfigMap 中的配置变化，自动更新配置信息，实现动态配置。

## ConfigMap的局限性
1. 不支持敏感数据：ConfigMap 主要用于存储非敏感的配置数据，例如环境变量、命令行参数、配置文件等，如果需要存储敏感数据，应该使用Secret对象。
2. 容量限制：ConfigMap 在设计上不是用来保存大量数据的。ConfigMap对象的大小存在一定的限制，单个ConfigMap 最大可容纳数据为1MB。当需要存储的数据量超过1MB 时，需要拆分成多个ConfigMap 或选择其他存储方式，可以考虑挂载存储卷或者使用独立的数据库或者文件服务。

# 创建 configMap 的几种方法
## 使用资源清单文件创建
| 字段名 | 类型 | 说明 |
| --- | --- | --- |
| `apiVersion` | string | 必填，通常为 `v1` |
| `kind` | string | 必填，`ConfigMap` |
| `metadata` | object | 必填，资源的元数据 |
| `data` | map | 配置的键值对，内容是字符串 |
| `binaryData` | map | 可选，base64 编码的二进制数据（字符串） |
| `immutable` | bool | 可选，设置为 `true` 表示此 ConfigMap 是不可变的（K8s v1.19+） |


编写资源文件清单，并最终使用` kubectl apply -f `应用配置

##  从文件创建  
### 从单个文件创建
```bash
kubectl create configmap <configmap-name> --from-file=<路径>
```

例如：

```bash
kubectl create configmap nginx-config --from-file=nginx.conf
```

+ 会创建一个名为 `nginx-config` 的 ConfigMap；
+ `nginx.conf` 文件的内容会变成 key 为 `nginx.conf` 的键值对。

###  从 单个文件创建并指定键名
```bash
kubectl create configmap nginx-config --from-file=nginx.conf=/path/to/my-nginx.conf
```

+ 指定 key 名为 `nginx.conf`，内容来自路径文件。  

###  从整个目录创建（目录下每个文件作为一个 key）  
```bash
kubectl create configmap nginx-config --from-file=./config-dir/
```

+ `config-dir/` 下所有文件都会作为 key；
+ 每个文件的内容会成为该 key 的值。

##  从命令行直接创建（键值对形式）  
```bash
kubectl create configmap <configmap-name> --from-literal=<key>=<value>
```

例如：

```bash
kubectl create configmap app-config \
  --from-literal=log_level=debug \
  --from-literal=port=8080
```

会创建如下结构的 ConfigMap：  

```yaml
data:
  log_level: debug
  port: 8080
```

# 实践
## 使用 ConfigMap 为 Nginx deployment 挂载配置文件和首页
1. ConfigMap 中定义 nginx 配置

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: nginx-config
  namespace: default
data:
  nginx.conf: |
    server {
        listen 8080;
        server_name localhost;

        location / {
            root /usr/share/nginx/html;
            index index.html index.htm;
        }
    }
  index.html: |
    <html>
      <body>
        <h1>Hello World</h1>
      </body>
    </html>
```

2. Deployment 中使用配置

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx-deployment
  namespace: default
spec:
  replicas: 1
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
        - name: nginx
          image: nginx:latest
          ports:
            - containerPort: 8080
          volumeMounts:
            - name: nginx-config-volume
              mountPath: /etc/nginx/conf.d/default.conf
              subPath: nginx.conf
            - name: nginx-config-volume
              mountPath: /usr/share/nginx/html/index.html
              subPath: index.html
      volumes:
        - name: nginx-config-volume # 挂载卷名称
          configMap:
            name: nginx-config # 从名称为nginx-config的configMap中读取

```

`subPath`与`mountPath`之间的关系可以理解为使用 `subPath` 的文件内容替换了`mountPath` 的文件内容，因此挂载的不是文件，而是文件中的内容，挂载后的绝对路径仍然和声明的`mountPath` 路径相同。

## 使用ConfigMap 为 NodeJs 应用程序挂载首页并注入环境变量
### NodeJs 程序
```javascript
const http = require('http');
const fs = require('fs');

const port = process.env.APP_PORT || 3000;
const indexFilePath = '/usr/share/app/index.html';

const server = http.createServer((req, res) => {
  fs.readFile(indexFilePath, (err, data) => {
    if (err) {
      res.writeHead(500);
      return res.end('Error loading index.html');
    }
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.end(data);
  });
});

server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});=
```

###  ConfigMap（配置端口和主页内容）  
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: nodejs-config
data:
  APP_PORT: "8080"
  index.html: |
    <html>
      <body>
        <h1>Hello from ConfigMap!</h1>
      </body>
    </html>
```

###  Deployment（使用 ConfigMap )
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nodejs-app
spec:
  replicas: 1
  selector:
    matchLabels:
      app: nodejs
  template:
    metadata:
      labels:
        app: nodejs
    spec:
      containers:
        - name: nodejs
          image: chunyiwang/nodejs-app:latest
          ports:
            - containerPort: 8080
          env:
            - name: APP_PORT # 读取ConfigMap中的端口配置
              valueFrom: # 环境变量注入，必须使用valueFrom字段
                configMapKeyRef: # 从ConfigMap中读取环境变量
                  name: nodejs-config # ConfigMap的名称
                  key: APP_PORT # 键值
          volumeMounts:
            - name: html-volume
              mountPath: /usr/share/app/index.html
              subPath: index.html
      volumes: # 挂载卷
        - name: html-volume # 挂载卷名称
          configMap: # 挂载卷读取自ConfigMap配置
            name: nodejs-config
```

# Secret 概述
## 什么是Secret？
Kubernetes Secret 是一种用于存储敏感数据的Kubernetes API对象。Secret 可以用于存储密码、密钥、API 令牌等敏感数据，并确保这些数据不被明文存储或传输。

Secret 可以以多种方式应用于Kubernetes 部署中。例如，可以将Secret用于创建Pod 和容器中的环境变量、命令行参数和卷。Secret 可以通过Kubernetes API 创建，它可以存储加密的数据，并在需要使用敏感数据时将其解密。

Kubernetes Secret 通过使用加密和解密机制来确保敏感数据的安全。可以使用多种类型的Secret，例如`Opaque Secret`、`TLS Secret`、`docker-registrySecret` 等。通常，Secret 的使用是在Kubernetes Pod 或Deployment 中设置环境变量或挂载到容器中使用。

## Secret 应用场景
1. 部署Web 应用程序：你可以使用Secret 来存储数据库密码、API 密钥、证书等信息，并将其作为环境变量注入到你的应用程序中
2. 部署SSL 证书：如果您需要使用HTTPS 加密协议来保护Web 应用程序的通信，您可以将SSL 证书存储在一个TLS 类型的Secret 中，并将其挂载到Pod的卷中。
3. 部署私有容器仓库：如果您需要访问您自己的私有Docker 容器仓库，您可以使用docker-registry 类型的Secret 来存储Docker 登录的用户名和密码，并将其作为环境变量注入到您的部署中。
4. 部署第三方服务集成：如果你需要与第三方API 集成，您可以使用Secret来存储API 密钥和证书等敏感信息，并将其作为环境变量注入到你的应用程序中。这样可以保护你的API 密钥和证书不被公开。

## Secret 常用类型
在Kubernetes 中，有以下五种主要类型的Secret 对象：

1. `Opaque`：Opaque 类型是最常用的Secret 类型，用于存储任意类型的数据。它可以存储任何格式的证书、密钥、密码等，但是不提供加密功能。
2. `TLS`：用于存储公钥、私钥和CA 证书等用于TLS 连接的数据。使用TLS类型的Secret 可以解决部署SSL 证书的问题。
3. `Docker Registry`：Docker Registry 类型用于在Kubernetes 中设置私有Docker Registry，存储用户名和密码等认证信息以便Pod 中的容器使用。
4. `Service Account`：Service Account 类型Secret 用于保存Kubernetes集群中的Service Account Token 和CA 证书信息，充当用于代表Pod 的标识。
5. `Generic`：用于以key-value 形式存储数据的Secret，与Opaque 类型类似。这种类型的Secret 允许您使用不同的编码（`base64`、`ascii`）加密数据，但也不提供加密功能。

# 创建与调用 Secret
## Secret 可用字段
|  字段名  |  取值类型  |  说明  |
| --- | --- | --- |
| `apiVersion` | string | Api 版本 |
| `data` | map[string]string | 用于存储Secret 中的实际数据，这些数据通常是被base64 编码的二进制数据。<br/>在一个Secret 对象中，可以定义多个键-值对，每个键值对都会被加密并保存在data 字段中。 |
| `immutable` | boolean | immutable 字段来指示该Secret 在创建后是否可以被修改。 |
| `stringData` | map[string]string | 除了使用data 字段存储Secret 中的数据以外，还可以使用stringData 字段。stringData 字段与data 字段类似，都是用来存储Secret 中的键值对。不同之处在于，stringData 字段中的数据不需要像data 字段中的数据一样先进行base64 编码。 |
| `type` | string | type 字段指定了用于指定的Secret 数据的编码和序列化格式。<br/>Kubernetes 中具有以下三种类型的Secret 类型：<br/>+ `Opaque`：这是默认值，适用于任何类型的Secret，包括二进制数据。<br/>+ `kubernetes.io/service-account-token`：此类型使用JWT格式存储服务账户令牌和CA 证书。<br/>+ `kubernetes.io/dockerconfigjson`：此类型用于带有Docker认证令牌的Secret。 |


## Secret 资源清单文件示例
创建一个 `secret` 存储 `mysql` 数据库的 root 用户密码

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: mysql-secret
type: Opaque
stringData:
  MYSQL_ROOT_PASSWORD: "123456"
  MYSQL_DATABASE: "my_db"
---
# 或者使用data，手动对明文进行base64编码后写入文件
apiVersion: v1
kind: Secret
metadata:
  name: mysql-secret
type: Opaque
data:
  MYSQL_ROOT_PASSWORD: MTIzNDU2Cg==
  MYSQL_DATABASE: bXlfZGIK
```

## 在工作资源的清单文件中调用 Secret
### 通过环境变量使用 Secret
#### 使用 envFrom
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mysql
spec:
  replicas: 1
  selector:
    matchLabels:
      app: mysql
  template:
    metadata:
      labels:
        app: mysql
    spec:
      containers:
        - name: mysql
          image: mysql:8.0
          ports:
            - containerPort: 3306
          envFrom:
            - secretRef:
                name: mysql-secret
          volumeMounts:
            - name: mysql-data
              mountPath: /var/lib/mysql
      volumes:
        - name: mysql-data
          emptyDir: {}
```

#### 使用 valueFrom
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mysql
spec:
  replicas: 1
  selector:
    matchLabels:
      app: mysql
  template:
    metadata:
      labels:
        app: mysql
    spec:
      containers:
        - name: mysql
          image: mysql:8.0
          ports:
            - containerPort: 3306
          env:
            - name: MYSQL_ROOT_PASSWORD #env的name就是容器中的环境变量名
              valueFrom:
                secretKeyRef:
                  name: mysql-secret
                  key: MYSQL_ROOT_PASSWORD # key是对secret键值对的引用，没有实际意义，也可以叫别的
            - name: MYSQL_DATABASE
              valueFrom:
                secretKeyRef:
                  name: mysql-secret
                  key: MYSQL_DATABASE
          volumeMounts:
            - name: mysql-data
              mountPath: /var/lib/mysql
      volumes:
        - name: mysql-data
          emptyDir: {}
```

#### 两者的区别
1. `envFrom`
+ 一次性导入 Secret 中的所有键值对；
+ 容器中环境变量名 **就是 Secret 中的键名**；如果 Secret 中有容器镜像不识别的键名，变量虽导入但没实际效果；
+ 不能修改环境变量名，也不能选择部分键值导入；
+ 适合 Secret 变量本身名称就符合镜像要求，且希望快速批量导入的场景。
2. `valueFrom`
+ 逐条导入 Secret 中的指定键；
+ `env.name` 决定容器中环境变量的名字，可以自定义为任何有效变量名；
+ Secret 中的键名可以是任意字符串，无需符合容器镜像预定义的环境变量名；
+ 适合需要重命名变量或只引用部分 Secret 数据的场景；
+ 更灵活、细粒度的控制。

### 使用 volumeMounts 挂载 Secret 到容器
将两个 token 挂载到容器`/etc/tokens` 目录下

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: node-web-tokens
type: Opaque
stringData:
  token1: "Xgr00l4rVvWDc7TpATAdKFZclSUHuK8PlYiTYqIGzG6lLumMaSZkv06j3t9ksiAy"
  token2: "dqhrqXHCCPhEJq91auj4qVY7oMubecuA97ACIwkwtEvp8MYt8e5m9EgOuYOFXq0r"
```

编写 Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: node-web
spec:
  replicas: 1
  selector:
    matchLabels:
      app: node-web
  template:
    metadata:
      labels:
        app: node-web
    spec:
      containers:
        - name: node-web
          image: node-web:v1
          ports:
            - containerPort: 8080
          volumeMounts:
            - name: token-volume
              mountPath: /etc/tokens
      volumes:
        - name: token-volume
          secret:
            secretName: node-web-tokens
            items:
            - key: token1
              path: token1.txt
            - key: token2
              path: token2.txt
```

或者

```yaml
...
      containers:
        - name: node-web
          image: node-web:v1
          volumeMounts:
            - name: token-volume
              mountPath: /etc/tokens/token1.txt
              subPath: token1
            - name: token-volume
              mountPath: /etc/tokens/token2.txt
              subPath: token2
      volumes:
        - name: token-volume
          secret:
            secretName: node-web-tokens

```

效果是完全相同的

# Reloader 实现 ConfigMap/Secret 热更新
## 项目地址
[stakater/Reloader](https://github.com/stakater/Reloader)

## 工作原理
1. 安装和配置Reloader

首先，需要在Kubernetes 集群中安装和配置Reloader。

2. 监听ConfigMap 更改

一旦Reloader 部署并启动，它会开始监听ConfigMap/Secret 资源。当资源发生变化时，Reloader 会捕获这些更改并触发重新加载操作。

3. 重新加载应用程序

当ConfigMap/Secret 发生更改时，Reloader 会自动重新加载应用程序，以便它能够使用最新的配置数据。这可以通过重启容器、使用热重载机制或使用其他适当的机制来完成。

4. 验证和测试

在应用程序重新加载后，开发人员可以验证配置是否已成功更新，并进行必要的测试以确保一切正常工作。

## 部署 Reloader
[https://github.com/stakater/Reloader/blob/master/deployments/kubernetes/reloader.yaml](https://github.com/stakater/Reloader/blob/master/deployments/kubernetes/reloader.yaml)

```bash
kubectl apply -f reloader.yaml
```

## 实践
### 部署一个 mysql 服务
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: mysql
  labels:
    app: mysql
data:
  my.cnf: |
    [mysqld]
    server-id=1
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mysql
  annotations:
    reloader.stakater.com/auto: "true" # 只要部署挂载的ConfigMap 或者secret 有更新，则滚动更新。
spec:
  replicas: 2
  selector:
    matchLabels:
      app: mysql
  template:
    metadata:
      labels:
        app: mysql
    spec:
      containers:
      - name: mysql
        image: mysql:8.0
        volumeMounts:
        - name: mysql-config
          mountPath: /tmp/config/my.cnf
          subPath: my-test.cnf
      volumes:
      - name: mysql-config
        configMap:
          name: mysql
          items:
          - key: my.cnf
            path: my-test.cnf
```

 在 Kubernetes 中，当使用 `ConfigMap`（或 `Secret`）作为卷挂载到 Pod 中时，可以通过 `items` 字段中的 `key` 和 `path` 实现精确控制。  

作用：

+ 从 ConfigMap 中选择指定的 `key`；
+ 将其挂载为容器文件系统中的一个具体文件，并使用 `path` 指定文件名。

用途：

+ 精选挂载部分配置，而非整个 ConfigMap；
+ 控制挂载进容器内文件的命名（可与应用期望路径匹配）；
+ 支持多个 key 挂载到不同文件路径。

### 扩展annotations 注解
如果一个部署中有多个ConfigMap 或者Secret，那么只想指定的ConfigMap或者Secret 更新的话才更新这个部署，可以指定名称，例如：

```yaml
# 更新单个或多个configmap 资源
kind: Deployment
metadata:
  annotations:
    configmap.reloader.stakater.com/reload: "a-configmap,b-configmap"
spec:
  template:
    metadata:
...
# 更新单个或多个secret 资源
kind: Deployment
metadata:
  annotations:
    secret.reloader.stakater.com/reload: "a-secret,b-secret"
spec:
  template:
    metadata:
...
```

