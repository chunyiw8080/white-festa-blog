---
title: 使用MySQL Router配置无故障感知的MySQL读写分离程序
published: 2025-05-11
pinned: false
description: 以ghost应用为例，配置基于MySQL Router的读写分离架构
tags: [MySQL]
category: 数据库
draft: false
---

# MySQL Router简单介绍
MySQL Router是Oracle推出的一个MySQL数据库代理工具，通过在主机上监听多个端口来实现读操作走Secondary，写操作走Primary，实现读写分离。

## MySQL Router的优势
1. 负载均衡：MySQL Router维护一个Primay Pool(在多主模式下)和Secondary Pool，提供读写操作的轮询机制；
2. 无感知Failover：MySQL通过mysql_innodb_cluster_metadata数据库确认集群状态，在首次初始化后，MySQL Router可以获得全部节点的信息，当主库宕机后，MySQL Router立即向从库查询新主库，并将写操作发送到新主库，在这一过程中，用户（应用程序）没有感知。

# 部署
环境：MySQL 8.0.45 一主二从集群，已配置innodb_cluster
- Primary: mysql-05
- Seconadry: mysql-06
- Secondary: mysql-07

## 部署MySQL Router
在实验环境中，MySQL Router与mysql-05部署在了同一虚拟机上，但在生产环境中，最好让MySQL Router单独占用一台主机。

### 下载并解压缩二进制文件包
```bash
wget https://dev.mysql.com/get/Downloads/MySQL-Router/mysql-router-8.0.45-linux-glibc2.28-x86_64.tar.xz
# 解压
tar -xf mysql-router-8.0.45-linux-glibc2.28-x86_64.tar.xz
# 重命名
mv mysql-router-8.0.45-linux-glibc2.28-x86_64 /opt/mysql-router
```

### 创建mysql router用户
```bash
useradd -r -s /usr/sbin/nologin mysqlrouter
```

### mysqlrouter生成配置文件
```bash
# 其实这里最好是单独在MySQL中创建一个mysqlrouter用户来执行
/opt/mysql-router/bin/mysqlrouter --bootstrap root@192.168.100.5:3306 --user=root
```
生成的配置文件位于：``/opt/mysql-router/mysqlrouter.conf``:
```ini
# File automatically generated during MySQL Router bootstrap
[DEFAULT]
name=system
user=root
keyring_path=/opt/mysql-router/var/lib/mysqlrouter/keyring
master_key_path=/opt/mysql-router/mysqlrouter.key
connect_timeout=5
read_timeout=30
dynamic_state=/opt/mysql-router/bin/../var/lib/mysqlrouter/state.json
client_ssl_cert=/opt/mysql-router/var/lib/mysqlrouter/router-cert.pem
client_ssl_key=/opt/mysql-router/var/lib/mysqlrouter/router-key.pem
client_ssl_mode=PREFERRED
server_ssl_mode=AS_CLIENT
server_ssl_verify=DISABLED
unknown_config_option=error

[logger]
level=INFO

[metadata_cache:bootstrap]
cluster_type=gr
router_id=4
user=mysql_router4_mhgy706
metadata_cluster=mainCluster
ttl=0.5
auth_cache_ttl=-1
auth_cache_refresh_interval=2
use_gr_notifications=0

[routing:bootstrap_rw]
bind_address=0.0.0.0
bind_port=6446
destinations=metadata-cache://mainCluster/?role=PRIMARY
routing_strategy=first-available
protocol=classic

[routing:bootstrap_ro]
bind_address=0.0.0.0
bind_port=6447
destinations=metadata-cache://mainCluster/?role=SECONDARY
routing_strategy=round-robin-with-fallback
protocol=classic

[routing:bootstrap_x_rw]
bind_address=0.0.0.0
bind_port=6448
destinations=metadata-cache://mainCluster/?role=PRIMARY
routing_strategy=first-available
protocol=x

[routing:bootstrap_x_ro]
bind_address=0.0.0.0
bind_port=6449
destinations=metadata-cache://mainCluster/?role=SECONDARY
routing_strategy=round-robin-with-fallback
protocol=x

[http_server]
port=8443
ssl=1
ssl_cert=/opt/mysql-router/var/lib/mysqlrouter/router-cert.pem
ssl_key=/opt/mysql-router/var/lib/mysqlrouter/router-key.pem

[http_auth_realm:default_auth_realm]
backend=default_auth_backend
method=basic
name=default_realm

[rest_router]
require_realm=default_auth_realm

[rest_api]

[http_auth_backend:default_auth_backend]
backend=metadata_cache

[rest_routing]
require_realm=default_auth_realm

[rest_metadata_cache]
require_realm=default_auth_realm
```
将配置文件拷贝到/etc目录下
```bash
mkdir /etc/mysqlrouter/
cp /opt/mysql-router/mysqlrouter.conf /etc/mysqlrouter/
```

### 创建service服务文件
在``/etc/systemd/system/``目录中，创建``mysqlrouter.service``文件
```ini
[Unit]
Description=MySQL Router
After=network.target

[Service]
Type=exec

User=mysqlrouter
Group=mysqlrouter

WorkingDirectory=/etc/mysqlrouter

ExecStartPre=/opt/mysql-router/bin/mysqlrouter --config-check -c /etc/mysqlrouter/mysqlrouter.conf
ExecStart=/opt/mysql-router/bin/mysqlrouter -c /etc/mysqlrouter/mysqlrouter.conf

Restart=always
RestartSec=5

LimitNOFILE=65535

StandardOutput=journal
StandardError=journal

NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true

[Install]
WantedBy=multi-user.target
```

### 重新载入service文件并运行mysql router
```bash
systemctl daemon-reload
systemctl enable --now mysqlrouter
```

### 查看端口监听状态
应该存在如下端口
```text
tcp        0      0 0.0.0.0:8443            0.0.0.0:*               LISTEN      1620/mysqlrouter    
tcp        0      0 0.0.0.0:6446            0.0.0.0:*               LISTEN      1620/mysqlrouter    
tcp        0      0 0.0.0.0:6447            0.0.0.0:*               LISTEN      1620/mysqlrouter    
tcp        0      0 0.0.0.0:6448            0.0.0.0:*               LISTEN      1620/mysqlrouter    
tcp        0      0 0.0.0.0:6449            0.0.0.0:*               LISTEN      1620/mysqlrouter 
```
端口作用
- 6446: Read/Write（主库连接）
- 6447: Read Only（从库连接）
- 6448: X Protocol Read/Write，这是 MySQL X Protocol 的写端口，一般用于MySQL Shell
- 6449: X Protocol Read Only，同上，不过是只读端口
- 8443: Router REST API / 管理接口

## 创建Ghost服务
这里使用kubernetes部署ghost deployment

### 创建ghost专用mysql用户和数据库
```sql
CREATE DATABASE ghost;
CREATE USER 'ghost'@'%' IDENTIFIED BY 'ghostpass';
GRANT ALL PRIVILEGES ON ghost.* TO 'ghost'@'%';

FLUSH PRIVILEGES;
```

### 为MySQL ghost用户和密码创建secret
```bash
kubectl create secret generic mysql-router-secret \
--from-literal=username=ghost \
--from-loteral=password=ghostpass
```

### 创建Deployment
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ghost-blog
  labels:
    app: ghost
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ghost
  template:
    metadata:
      labels:
        app: ghost
    spec:
      containers:
        - name: ghost
          image: ghost:5
          ports:
            - containerPort: 2368
          env:
            - name: database__client
              value: "mysql"
              # host使用mysql router所在节点的ip地址或者本地域名解析也可以
            - name: database__connection__host
              value: "192.168.100.5"
              # ghost默认不支持读写分离，所以这里端口选主库端口，可读可写
            - name: database__connection__port
              value: "6446"
              # 刚刚创建的MySQL ghost用户和密码
            - name: database__connection__user
              valueFrom: 
                secretKeyRef: 
                    name: mysql-router-secret 
                    key: username
            - name: database__connection__password
              valueFrom: 
                secretKeyRef: 
                    name: mysql-router-secret 
                    key: password
            - name: database__connection__database
              value: "ghost"
```
### 创建Service
```yaml
apiVersion: v1
kind: Service
metadata:
  name: ghost
spec:
  selector:
    app: ghost
  type: NodePort
  ports:
  - name: tcp-2368
    port: 2368
    targetPort: 2368
    protocol: TCP
    nodePort: 32368
```
### 测试
在deployment.yaml和service.yaml都部署好后，可以通过``http://<node-ip>:32368``测试访问，如果能够看见Ghost的默认主题，就是成功了，之后可以尝试手动停止主库，然后看看ghost是否还能使用

# 进阶用法
在部署好了mysql router后，此时后端应用使用多节点的kubernetes部署，MySQL数据库是一主二从的集群，只有MySQL Router是一个单点应用，因此现在MySQL Router是项目的薄弱点


若想进一步提升在压力下的集群健壮性，有三种方法可以选择:
- 创建多个MySQL Router实例，并用Keepalived配置虚拟IP绑定，实现MySQL Router的自动failover
- 创建多个MySQL Router实例，使用nginx L4负载均衡轮询或权重算法分发流量
- 在配置负载均衡的基础上，再为Nginx实例配置keepalived


通常情况下，选择``Keepalived + MySQL Router``或者``nginx L4 + MySQL Router``就足够了，``Keepalived + nginx L4 + MySQL Router``虽然健壮性更好，但是网络跳数增加了，并且运维复杂性也提高了，除非面对超大流量的大规模集群，否则额外增加的复杂性可能是不必要的。