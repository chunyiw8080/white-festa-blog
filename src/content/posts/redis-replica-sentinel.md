---
title: Redis主从复制和哨兵
published: 2023-06-17
pinned: false
description: 通过Redis主从复制实现Redis服务的高可用性、数据冗余；使用Sentinel实现故障恢复
tags: [Redis]
category: 数据库
draft: false
---

## Redis主从复制
### 概述
主从复制的作用主要包括
* 数据冗余：主从复制实现了数据的热备份，是持久化之外的一种数据冗余方式。
* 故障恢复：当主节点出现问题时，可以由从节点提供服务，实现快速的故障恢复；实际上是一种服务的冗余。
* 负载均衡：在主从复制的基础上，配合读写分离，可以由主节点提供写服务，由从节点提供读服务（即写Redis数据时应用连接主节点，读Redis数据时应用连接从节点），分担服务器负载；
尤其是在写少读多的场景下，通过多个从节点分担读负载，可以大大提高Redis服务器的并发量。
* 高可用基石：除了上述作用以外，主从复制还是哨兵和集群能够实施的基础，因此说主从复制是Redis高可用的基础。

主从库之间采用的是读写分离的方式。
* 读操作：主库、从库都可以接收
* 写操作：首先到主库执行，然后，主库将写操作同步给从库。

### 配置主从复制
在配置文件中配置参数：
``` bash
replicaof <master ip> <master port>
# 在5.0以前的版本中，使用slaveof替换replicaof
```
主库设置密码情况下的主从复制，从库也要设置对应的密码，使用masterauth参数
``` bash
masterauth password # password要和主库配置文件中的requirepass一致
```
*注意：从库建立主从关系时，会清空自己的数据，慎重同步的对象*
#### 取消从库身份
``` txt
replicaof no one 
```
#### 查看redis主从复制信息
``` txt
127.0.0.1:6379> info replication
# Replication
role:master
connected_slaves:2
slave0:ip=172.16.1.51,port=6379,state=online,offset=182,lag=0
slave1:ip=172.16.1.53,port=6379,state=online,offset=182,lag=1
master_replid:eb03a6c3a470f5e2a66d4b2e6c7b8be4f53bc7eb
master_replid2:0000000000000000000000000000000000000000
master_repl_offset:182
second_repl_offset:-1
repl_backlog_active:1
repl_backlog_size:1048576
repl_backlog_first_byte_offset:1
repl_backlog_histlen:182
```

#### 主从故障介入
1. 主库的IP地址
2. 从节点要重新 REPLICAOF 设置复制角色


*注意：redis不同大版本之间存在兼容性问题，因此主从复制的主库和从库实例应该拥有相同的大版本。*

## Redis高可用哨兵
哨兵机制（Redis Sentinel）在Redis 2.8版本开始引入，其核心功能是主节点的自动故障转移。

### 哨兵的功能
* 监控（Monitoring）：哨兵会不断地检查主节点和从节点是否运作正常。
* 自动故障转移（Automatic failover）：当主节点不能正常工作时，哨兵会开始自动故障转移操作，它会将失效主节点的其中一个从节点升级为新的主节点，并让其他从节点改为复制新的主节点。
* 配置提供者（Configuration provider）：客户端在初始化时，通过连接哨兵来获得当前Redis服务的主节点地址。
* 通知（Notification）：哨兵可以将故障转移的结果发送给客户端。
### 哨兵通信(发布/订阅机制)
* 哨兵之间可以互相发现，主要是基于发布/订阅机制；在主从集群上，主库有一个__sentinel__:hello的频道，不同哨兵就是通过它来相互发现，实现互相通信的。
* 手动进行发布和订阅
    - 从库订阅一个频道：SUBSCRIBE channel_1
    - 主库通过该频道推送消息：PUBLISH channel_1 message

### 部署哨兵
1. 哨兵的部署是与redis-server相独立的进程，需要额外占用一个端口(默认为26379)
2. 部署哨兵的关键参数
    * ``sentinel monitor <master_name> <ip> <port> <amount>``：监控的主库节点，*amount* 为需要几台哨兵同意才能下线
    * ``sentinel down-after-milliseconds <master_name> <time>``：超过设定时间没回复认定master下线
    * ``sentinel parallel-syncs <master_name> <number>``：当Sentinel节点集合对主节点故障判定达成一致时，Sentinel领导者节点会做故障转移操作，选出新的主节点，原来的从节点会向新的主节点发起复制操作，限制每次向新的主节点发起复制操作的从节点个数为 *number*
    * ``sentinel failover-timeout <master_name> <time>``： 故障转移超时时间为指定的时间
3. 确保主库从库之间成功建立的复制关系，务必在从库的配置文件中指明``replicaof``的IP
4. 以``master-slave-sentinel``的顺序依次开启服务
5. 可以手写redis-sentinel启动脚本并配置到systemctl服务管理中/usr/lib/systemd/system/redis-sentinel.service

``` bash
[Unit]
Description=Redis service by www.yuchaoit.cn
After=network.target
After=network-online.target
Wants=network-online.target
[Service]
ExecStart=/usr/local/bin/redis-sentinel /opt/sentinel/conf/sentinel.conf --supervised systemd
ExecStop=/usr/local/bin/redis-cli -h $(ifconfig ens33|awk 'NR==2{print $2}') -p 26379 shutdown
Type=notify
User=redis
Group=redis
RuntimeDirectory=redis
RuntimeDirectoryMode=0755
[Install]
WantedBy=multi-user.target
```
6. 确保redis用户拥有redis和redis-sentinel附属文件的权限。
7. 哨兵需要部署在主从复制的每个节点上。

### 选举新Master的依据
1. 过滤掉不健康的（下线或断线），没有回复过哨兵ping响应的从节点
2. 选择salve-priority从节点优先级最高（redis.conf）的
3. 选择复制偏移量最大，复制最完整的从节点.

### 哨兵部署脚本
``` bash
#!/bin/bash
local_ip=$(ifconfig eth1 | grep inet | grep -v 127.0.0.1 | grep -v inet6 | awk '{print $2}' | tr -d "addr:")

function deploySentinel(){
    mkdir -p /opt/sentinel/{conf,pid,logs,data}

    cat > /opt/sentinel/conf/sentinel.conf <<EOF
    bind ${local_ip}
    port 26379
    daemonize yes
    logfile /opt/sentinel/logs/sentinel.log
    dir /opt/sentinel/data
    sentinel monitor redis-master 172.16.1.51 6379 2
    sentinel down-after-milliseconds  redis-master 30000
    sentinel parallel-syncs redis-master 1
    sentinel failover-timeout redis-master 180000
EOF
}
function changeOwner(){
    chown -R redis.redis /opt/sentinel/
}
function systemdScript(){
    touch /lib/systemd/system/sentinel.service
    cat > /lib/systemd/system/sentinel.service <<EOF
    [Unit]
    Description=Redis-sentinel service
    After=network.target
    After=network-online.target
    Wants=network-online.target

    [Service]
    ExecStart=/usr/local/bin/redis-sentinel /opt/sentinel/conf/sentinel.conf --supervised systemd
    ExecStop=/usr/local/bin/redis-cli -h ${local_ip} -p 26379 shutdown
    Type=notify
    User=redis
    Group=redis
    RuntimeDirectory=redis
    RuntimeDirectoryMode=0755
    
    [Install]
    WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl start sentinel
}
function sentinelInfo(){
    redis-cli -h ${local_ip} -p 26379 info sentinel
}

deploySentinel
changeOwner
systemdScript
sentinelInfo
```
### 查看sentinel信息
``` bash
# Sentinel
sentinel_masters:1
sentinel_tilt:0
sentinel_running_scripts:0
sentinel_scripts_queue_length:0
sentinel_simulate_failure_flags:0
master0:name=redis-master,status=ok,address=172.16.1.51:6379,slaves=2,sentinels=3
```
当ststus=ok时哨兵就已经成功的部署了。

### 哨兵的配置重写功能
哨兵在成功部署后会自动接管维护自己的配置文件，当主从关系发生变化时，哨兵会自动重写配置文件。
重写后的配置文件：
``` bash
bind 172.16.1.52
port 26379
daemonize yes
logfile "/opt/sentinel/logs/sentinel.log"
dir "/opt/sentinel/data"

sentinel myid a440f06487c182d52abda18755bd092781a04b7d
sentinel deny-scripts-reconfig yes
sentinel monitor redis-master 172.16.1.51 6379 2
sentinel config-epoch redis-master 0
# Generated by CONFIG REWRITE
maxclients 4064
protected-mode no
supervised systemd
sentinel leader-epoch redis-master 0
sentinel known-replica redis-master 172.16.1.53 6379
sentinel known-replica redis-master 172.16.1.52 6379
sentinel known-sentinel redis-master 172.16.1.51 26379 17dcc1eb843c0427d82c56444936dd03da8f78c2
sentinel known-sentinel redis-master 172.16.1.53 26379 e11a84ea040dc465ba9d7ca7f1d2c87eb696c3ae
sentinel current-epoch 0
```

### 测试主从故障的自动化转移

#### 模拟故障，shutdown当前主库
![主从切换](https://blog.freelytomorrow.com/articles_img/redis-replica-sentinel/failure1.png)
172.16.1.52机器成为了master
#### 主从配置更新
sentinel自动为db-53机器修改了配置文件
![redis配置更新](https://blog.freelytomorrow.com/articles_img/redis-replica-sentinel/failure2.png)
#### Sentinel配置更新
![sentinel配置更新](https://blog.freelytomorrow.com/articles_img/redis-replica-sentinel/failure3.png)
#### 重新上线db-51
![db51身份](https://blog.freelytomorrow.com/articles_img/redis-replica-sentinel/failure4.png)
#### 查看sentinel日志
![sentinel日志](https://blog.freelytomorrow.com/articles_img/redis-replica-sentinel/sentinel-log.png)

