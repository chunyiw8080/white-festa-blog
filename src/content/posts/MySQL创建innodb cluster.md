---
title: MySQ8.0创建innodb cluster
published: 2025-05-06
pinned: false
description: 通过mysqlsh创建一主二从的MySQL innodb cluster集群教程，可实现主从复制和自动failover
tags: [MySQL]
category: 数据库
draft: false
---

# 简介
MySQL InnoDB Cluster 是Oracle从MySQL 8.0开始内置在MySQL中的高可用集群方案，提供了Group Replication，一种新的主从复制技术，同时InnoDB Cluster内置了failover机制，当主库发生故障时，集群会自动选举新主库，如果结合mysql router，是MHA在8.0版本中的很好的替代。

# MySQL Group Replication与传统主从复制的差异
| 特性    | 传统复制        | InnoDB Cluster        |
| ----- | ----------- | --------------------- |
| 复制方式  | binlog 异步复制 | group replication     |
| 一致性   | 最终一致        | 准同步（事务级一致）            |
| 主节点故障 | 需要人工切换      | 自动选主                  |
| 集群状态  | 无统一管理       | cluster metadata      |
| 节点写入  | 只能主库        | 有多主(多写)模式        |
| 数据冲突  | 可能          | group replication 会检测 |

# 部署innodb cluster

## 一、实验环境
- 三台虚拟机：mysql-11, mysql-12, mysql-13
- 系统：Rocky Linux 9
- MySQL版本：8.0.45

## 二、安装mysqlsh
mysqlsh是支持js、Python等多种语言在内的高级MySQL客户端，可以利用内置的函数实现对MySQL的管理。

### 1. 下载并安装
```bash
# 下载
wget https://dev.mysql.com/get/Downloads/MySQL-Shell/mysql-shell-8.0.45-linux-glibc2.28-x86-64bit.tar.gz
# 解压
tar -xf mysql-shell-8.0.45-linux-glibc2.28-x86-64bit.tar.gz
# 重命名
mv mysql-shell-8.0.45-linux-glibc2.28-x86-64bit mysql-shell
# 配置环境变量
echo 'export PATH=/opt/mysql-shell/bin:$PATH' >> /etc/profile
# 生效环境变量
source /etc/profile
```
### 2. 验证
```bash
mysqlsh --version
```
应出现如下结果
```text
mysqlsh   Ver 8.0.45 for Linux on x86_64 - for MySQL 8.0.45 (MySQL Community Server (GPL))
```

## 三、创建用户
InnoDB Cluster创建时，如果hostname和report_host配置不一致，很容易直接崩溃。


在mysqlsh连接到数据库时，会自动将主机名解析为ip，因此必须创建``'root'@'192.168.100.%'``用户，以允许root从所有192.168.100.0/24网段下的主机登录。相比'%'，此方法的安全性更好。

```sql
CREATE USER 'root'@'192.168.100.%' IDENTIFIED WITH mysql_native_password BY '123456';
GRANT ALL PRIVILEGES ON *.* TO 'root'@'192.168.100.%' WITH GRANT OPTION; 
flush privileges;
```

## 四、实例初始化
为集群中的每个实例执行：


1. 初始化当前实例
```js
dba.configureInstance()
```
2. 检查服务器节点配置
```js
dba.checkInstanceConfiguration('root@mysql-11:3306')
dba.checkInstanceConfiguration('root@mysql-12:3306')
dba.checkInstanceConfiguration('root@mysql-13:3306')
```
3. 预期结果
```text
Validating local MySQL instance listening at port 3306 for use in an InnoDB cluster...

This instance reports its own address as [mysql-master-02:3306/mysql-replica-11:3306/mysql-replica-12:3306]
Clients and other cluster members will communicate with it through this address by default. If this is not correct, the report_host MySQL system variable should be changed.

Checking whether existing tables comply with Group Replication requirements...
No incompatible tables detected

Checking instance configuration...
Instance configuration is compatible with InnoDB cluster

The instance 'mysql-master-02:3306' is valid to be used in an InnoDB cluster.

{
    "status": "ok"
}

```
## 五、创建集群
在选定的主库中执行
```js
var cluster = dba.createCluster('mainCluster',{multiPrimary:false})
// {multiPrimary:false}: 不启用多主模式（默认单主）
```
应该出现如下结果
```text
A new InnoDB Cluster will be created on instance 'mysql-11:3306'.

Validating instance configuration at mysql-11:3306...

This instance reports its own address as mysql-11:3306

Instance configuration is suitable.
NOTE: Group Replication will communicate with other members using 'mysql-11:3306'. Use the localAddress option to override.

* Checking connectivity and SSL configuration...

Creating InnoDB Cluster 'mainCluster' on 'mysql-11:3306'...

Adding Seed Instance...
Cluster successfully created. Use Cluster.addInstance() to add MySQL instances.
At least 3 instances are needed for the cluster to be able to withstand up to
one server failure.
```

## 六、将其他节点加入集群
```js
cluster.addInstance('root@mysql-12:3306')
cluster.addInstance('root@mysql-13:3306')
```
:::tip
注意：在将节点加入到集群中后，需要重新启动mysqld，使用``systemctl status mysqld``查看目标节点状态，如果不是running状态，则需要``systemctl start mysqld``。

之后会提示``The instance 'your-instance:3306' was successfully added to the cluster metadata.``
:::

## 七、查看集群状态
```js
var cluster = dba.getCluster();
cluster.status();
```
应显示json格式的集群信息
```json
{
    "clusterName": "mainCluster", 
    "defaultReplicaSet": {
        "name": "default", 
        "primary": "mysql-11:3306", 
        "ssl": "REQUIRED", 
        "status": "OK", 
        "statusText": "Cluster is ONLINE and can tolerate up to ONE failure.", 
        "topology": {
            "mysql-11:3306": {
                "address": "mysql-11:3306", 
                "memberRole": "PRIMARY", 
                "mode": "R/W", 
                "readReplicas": {}, 
                "replicationLag": "applier_queue_applied", 
                "role": "HA", 
                "status": "ONLINE", 
                "version": "8.0.45"
            }, 
            "mysql-12:3306": {
                "address": "mysql-12:3306", 
                "memberRole": "SECONDARY", 
                "mode": "R/O", 
                "readReplicas": {}, 
                "replicationLag": "applier_queue_applied", 
                "role": "HA", 
                "status": "ONLINE", 
                "version": "8.0.45"
            }, 
            "mysql-13:3306": {
                "address": "mysql-13:3306", 
                "memberRole": "SECONDARY", 
                "mode": "R/O", 
                "readReplicas": {}, 
                "replicationLag": "applier_queue_applied", 
                "role": "HA", 
                "status": "ONLINE", 
                "version": "8.0.45"
            }
        }, 
        "topologyMode": "Single-Primary"
    }, 
    "groupInformationSourceMember": "mysql-11:3306"
}
```

# 集群重启后恢复集群
```js
dba.rebootClusterFromCompleteOutage()
```