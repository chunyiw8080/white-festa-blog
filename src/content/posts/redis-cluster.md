---
title: Redis cluster分片存储技术
published: 2023-06-25
pinned: false
description: Redis分片存储 - 将大量数据分布式存储在多个Redis数据库实例中
tags: [Redis]
category: 数据库
draft: false
---

## 什么是分片存储
由于redis是基于内存的数据库，不像传统的数据库可以通过大量扩展磁盘来扩大存储能力，因此开发了分片存储的技术；分片存储就是将大量数据分布式存储在多个redis实例中。

## redis cluster核心概念
1. redis集群通过哈希槽的概念，来决定key放在哪个槽里，一个redis集群最多有16384个哈希槽；
2. 每一个key通过CRC16算法校验后决定放入哪个槽位；
3. redis集群中的每一个节点，负责一部分哈希槽（hash slot）；例如集群中有三个节点，节点A负责0-5500，节点B负责5501-11000，节点c负责11001-16384。
4. 槽位必须分配正确(收尾相连)，否则集群无法使用。
5. redis通过 hash tags功能，实现将多个相关的key，放到同一个hash slot中
6. redis集群的每一个节点，都有唯一的名字，由十六进制的数字表示，一般基于/dev/urandom自动生成。且节点在配置文件中保留ID，除非用户主动执行``cluster reset hard``或者``hard reset``节点。主要存储的信息是:
``node id, address:port, flags, last ping sent, last pong received, configuration epoch, link state, slots``.
7. redis集群每一个节点都相互ping，建立了TCP连接，且保存活跃性，期望得到对方节点的pong回复。
8. redis请求重定向
redis cluster采用去中心化的架构，集群的每一个节点都复制一部分槽位，客户端在写入key时，到底放到哪个槽位呢？
    * 检查当前key是否存在于node：基于crc16算法/16384取模计算，得到slot槽位，然后查询负责该slot的节点
    * 若slot不是自身，自动进行moved重定向
    * 若slot是自身，且key在slot里，立即返回该key的结果
    * 若key不在当前节点slot里，检查slot是否在migrating，数据迁移中
    * 如果key正在迁移，返回ask错误给客户端
    * 若slot未迁移，检查slot是否在导入中
    * 若slot在导入中，且有asking标记，则直接操作
    * 否则返回moved重定向。

## 部署Redis cluster
cluster默认是基于主从复制的，也就是说一个拥有三个节点的集群，每个节点都有一个从库。这里为每台虚拟机部署两个redis，一主一从，主库端口6379，从库6380。
### 修改配置文件，开启cluster功能
主要基于以下三个参数，
``` bash
cluster-enabled yes
cluster-config-file cluster-80.conf 
cluster-node-timeout 15000 
```
cluster-80.conf是cluster集群的配置文件，该文件会自动生成在dir声明的路径下，内容是集群的节点和状态
``` bash
6ec8824c24f475852a4770ff7bdec2d145a8c3c1 :6379@16379 myself,master - 0 0 0 connected 9189
vars currentEpoch 0 lastVoteEpoch 0
```
重新启动redis并查看进程，可以发现redis目前是以集群状态运行
``` bash
[root@db-53 /lib/systemd/system]#ps -ef | grep redis
root       3021      1  0 13:43 ?        00:00:00 /usr/local/bin/redis-server 172.16.1.53:6379 [cluster]
root       3022      1  0 13:43 ?        00:00:00 /usr/local/bin/redis-server 172.16.1.53:6380 [cluster]
```
### service服务脚本
``` bash
[Unit]
Description=Redis cluster master
After=syslog.target network.target remote-fs.target nss-lookup.target

[Service]
Type=forking
ExecStart=/bin/bash -c '/usr/local/bin/redis-server /opt/redis/conf/redis.conf'
ExecStop=/bin/bash -c '/usr/local/bin/redis-cli -h $(ifconfig eth1|awk 'NR==2{print $2}') -p 6379 shutdown'
Restart=always
PrivateTmp=True

[Install]
WantedBy=multi-user.target
```
master和slave的服务脚本，除了ExecStop的端口号，其他都一样。

## 节点握手
一个meet消息，就像ping命令，且会强制接受者作为集群的一个节点
``` bash
172.16.1.51:6379> cluster meet 172.16.1.52 6379
OK
172.16.1.51:6379> cluster meet 172.16.1.53 6379
OK
172.16.1.51:6379> cluster meet 172.16.1.51 6380
OK
172.16.1.51:6379> cluster meet 172.16.1.52 6380
OK
172.16.1.51:6379> cluster meet 172.16.1.53 6380
OK
```

查看集群节点
``` bash
172.16.1.51:6379> cluster nodes
760041e23f2c58477989205c05e4f604c1ab6b61 172.16.1.52:6379@16379 master - 0 1695874978569 1 connected
dd643db1986c6f65f0a9730cc5db7cc0c95c4a4f 172.16.1.53:6379@16379 master - 0 1695874976000 5 connected
e6a3067c56e42ac16e0a82f40b215aac5a130489 172.16.1.53:6380@16380 master - 0 1695874977000 0 connected
8ea2f6efb0ce756497701a920ea0cbe32a5a4814 172.16.1.51:6379@16379 myself,master - 0 1695874974000 2 connected
2fe100ff72828302cbfd2daf15630c6578112f55 172.16.1.51:6380@16380 master - 0 1695874977000 3 connected
2a6f3639b4f114c3be1d5e1853cbb698f5423c9a 172.16.1.52:6380@16380 master - 0 1695874977556 4 connected
```

## 分配槽位
这里要注意分配槽位一定要前后数字收尾相接，遗落任何一个槽位都会导致分配失败。
``` bash
redis-cli -h 172.16.1.51 -p 6379 cluster addslots {0..5460}
redis-cli -h 172.16.1.52 -p 6379 cluster addslots {5461..10921}
redis-cli -h 172.16.1.53 -p 6379 cluster addslots {10922..16383}
```
然后使用``cluster info``命令查看集群状态
``` bash
[root@db-51 /lib/systemd/system]#redis-cli -h 172.16.1.51 -p 6379 cluster info
cluster_state:ok
cluster_slots_assigned:16384
cluster_slots_ok:16384
cluster_slots_pfail:0
cluster_slots_fail:0
cluster_known_nodes:6
cluster_size:3
cluster_current_epoch:5
cluster_my_epoch:2
cluster_stats_messages_ping_sent:664
cluster_stats_messages_pong_sent:675
cluster_stats_messages_meet_sent:5
cluster_stats_messages_sent:1344
cluster_stats_messages_ping_received:675
cluster_stats_messages_pong_received:669
cluster_stats_messages_received:1344
```
``cluster_state``为OK就是分配成功了

## 为slave节点添加复制关系
语法是：``cluster replicate master_id``，master_id可以使用``cluster nodes``查看
``` bash
[root@db-51 /lib/systemd/system]#redis-cli -h 172.16.1.51 -p 6380 cluster replicate 8ea2f6efb0ce756497701a920ea0cbe32a5a4814
OK
[root@db-51 /lib/systemd/system]#redis-cli -h 172.16.1.52 -p 6380 cluster replicate 760041e23f2c58477989205c05e4f604c1ab6b61
OK
[root@db-51 /lib/systemd/system]#redis-cli -h 172.16.1.53 -p 6380 cluster replicate dd643db1986c6f65f0a9730cc5db7cc0c95c4a4f
OK
```
最后再用cluster nodes确认一下复制关系是否正确
![cluster复制关系](https://blog.freelytomorrow.com/articles_img/redis-cluster/cluster1.png)
如果是实际生产环境的话，主从库建议不要放在同一台机器上，这样可以防止突发的机器或系统故障导致主从库同时宕机

## 测试写入数据
使用一个for循环写入2000条数据
``` bash
for i in {1..2000}
do 
	redis-cli -h 172.16.1.51 -p 6379 set k_${i} data_${i} && echo "Writing in key_${i}"
done
```
### 注意：
向集群写入数据必须使用-c参数，否则会显示大量的重定向错误，这是因为根据CRC16算法取模计算后得出的slots编号不在本机，因此被重定向写入到了其他机器上，但是非cluster客户端向cluster服务端写入数据会导致无法完成重定向，因此会导致大量的报错和数据丢失。

结果
``` bash
[root@db-51 ~]#redis-cli -h 172.16.1.51 -p 6379 dbsize
(integer) 677
[root@db-51 ~]#redis-cli -h 172.16.1.52 -p 6379 dbsize
(integer) 655
[root@db-51 ~]#redis-cli -h 172.16.1.53 -p 6379 dbsize
(integer) 668
```
2000个key基本上是被平均写到了三个节点之中。

## Redis分片集群自动部署

### Redis 5.0版本以前
5.0之前的版本需要用到redis官方提供的一个ruby脚本，这个脚本路径在redis软件包的/src路径下。
由于是ruby脚本，所以需要配置ruby环境才能顺利执行。
#### 安装ruby环境
``` bash
yum install rubygems -y
```
#### 配置ruby软件源
``` bash
# 移除默认软件源
gem sources --remove https://rubygems.org/
# 使用腾讯软件源
gem sources -a https://mirrors.cloud.tencent.com/rubygems/
```
#### 通过ruby包管理工具，安装操作redis的模块
``` bash
gem install redis -v 3.3.3
```

#### 部署redis集群
``` bash
./redis-trib.rb create --replicas 1 172.16.1.51:6379 172.16.1.52:6379 172.16.1.53:6379 172.16.1.51:6380 172.16.1.52:6380 172.16.1.53:6380
```
这里因为我使用的是5.0.7版本的redis，所以失败了，提示该脚本以不再受支持，所有功能以被整合到redis-cli中。

### Redis 5.0之后版本
如之前所说的，redis-trib.rb的功能已经被整合到redis-cli中，部署更加简单了。
``` bash
./redis-cli -h 172.16.1.51 -p 6379 --cluster create 172.16.1.51:6379 172.16.1.52:6379 172.16.1.53:6379 172.16.1.51:6380 172.16.1.52:6380 172.16.1.53:6380 --cluster-replicas 1
```
这里的``--cluster-replicas 1``表示为每个主库创建一个从库，如果是一主两从，后面的值就是2；
``create``后面跟的ip顺序是先写master ip，再写slave ip。

#### 结果
``` txt
>>> Performing hash slots allocation on 6 nodes...
Master[0] -> Slots 0 - 5460
Master[1] -> Slots 5461 - 10922
Master[2] -> Slots 10923 - 16383
Adding replica 172.16.1.52:6380 to 172.16.1.51:6379
Adding replica 172.16.1.53:6380 to 172.16.1.52:6379
Adding replica 172.16.1.51:6380 to 172.16.1.53:6379
M: 8ea2f6efb0ce756497701a920ea0cbe32a5a4814 172.16.1.51:6379
   slots:[0-5460] (5461 slots) master
M: 760041e23f2c58477989205c05e4f604c1ab6b61 172.16.1.52:6379
   slots:[5461-10922] (5462 slots) master
M: dd643db1986c6f65f0a9730cc5db7cc0c95c4a4f 172.16.1.53:6379
   slots:[10923-16383] (5461 slots) master
S: 2fe100ff72828302cbfd2daf15630c6578112f55 172.16.1.51:6380
   replicates dd643db1986c6f65f0a9730cc5db7cc0c95c4a4f
S: 2a6f3639b4f114c3be1d5e1853cbb698f5423c9a 172.16.1.52:6380
   replicates 8ea2f6efb0ce756497701a920ea0cbe32a5a4814
S: e6a3067c56e42ac16e0a82f40b215aac5a130489 172.16.1.53:6380
   replicates 760041e23f2c58477989205c05e4f604c1ab6b61
Can I set the above configuration? (type 'yes' to accept): yes
>>> Nodes configuration updated
>>> Assign a different config epoch to each node
>>> Sending CLUSTER MEET messages to join the cluster
Waiting for the cluster to join
......
>>> Performing Cluster Check (using node 172.16.1.51:6379)
M: 8ea2f6efb0ce756497701a920ea0cbe32a5a4814 172.16.1.51:6379
   slots:[0-5460] (5461 slots) master
   1 additional replica(s)
S: 2fe100ff72828302cbfd2daf15630c6578112f55 172.16.1.51:6380
   slots: (0 slots) slave
   replicates dd643db1986c6f65f0a9730cc5db7cc0c95c4a4f
S: e6a3067c56e42ac16e0a82f40b215aac5a130489 172.16.1.53:6380
   slots: (0 slots) slave
   replicates 760041e23f2c58477989205c05e4f604c1ab6b61
M: 760041e23f2c58477989205c05e4f604c1ab6b61 172.16.1.52:6379
   slots:[5461-10922] (5462 slots) master
   1 additional replica(s)
S: 2a6f3639b4f114c3be1d5e1853cbb698f5423c9a 172.16.1.52:6380
   slots: (0 slots) slave
   replicates 8ea2f6efb0ce756497701a920ea0cbe32a5a4814
M: dd643db1986c6f65f0a9730cc5db7cc0c95c4a4f 172.16.1.53:6379
   slots:[10923-16383] (5461 slots) master
   1 additional replica(s)
[OK] All nodes agree about slots configuration.
>>> Check for open slots...
>>> Check slots coverage...
[OK] All 16384 slots covered.
```

