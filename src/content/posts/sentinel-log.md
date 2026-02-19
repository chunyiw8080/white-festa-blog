---
title: Redis哨兵日志参数详解
published: 2023-06-19
pinned: false
description: 分析一次Redis故障转移的日志内容
tags: [Redis]
category: 数据库
draft: false
---

sentinel的日志中包含了很多关键参数，这些参数说明了sentinel的当前状态和sentinel完成一个操作(比如故障转移)都做了哪些事，是什么流程，下面是一个故障转移的日志更新内容：
``` txt
2938:X 27 Sep 2023 12:19:57.890 # +sdown master redis-master 172.16.1.51 6379
2938:X 27 Sep 2023 12:19:57.958 # +odown master redis-master 172.16.1.51 6379 #quorum 2/2
2938:X 27 Sep 2023 12:19:57.958 # +new-epoch 1
2938:X 27 Sep 2023 12:19:57.958 # +try-failover master redis-master 172.16.1.51 6379
2938:X 27 Sep 2023 12:19:57.959 # +vote-for-leader 17dcc1eb843c0427d82c56444936dd03da8f78c2 1
2938:X 27 Sep 2023 12:19:57.960 # e11a84ea040dc465ba9d7ca7f1d2c87eb696c3ae voted for 17dcc1eb843c0427d82c56444936dd03da8f78c2 1
2938:X 27 Sep 2023 12:19:57.960 # a440f06487c182d52abda18755bd092781a04b7d voted for 17dcc1eb843c0427d82c56444936dd03da8f78c2 1
2938:X 27 Sep 2023 12:19:58.023 # +elected-leader master redis-master 172.16.1.51 6379
2938:X 27 Sep 2023 12:19:58.023 # +failover-state-select-slave master redis-master 172.16.1.51 6379
2938:X 27 Sep 2023 12:19:58.086 # +selected-slave slave 172.16.1.52:6379 172.16.1.52 6379 @ redis-master 172.16.1.51 6379
2938:X 27 Sep 2023 12:19:58.086 * +failover-state-send-slaveof-noone slave 172.16.1.52:6379 172.16.1.52 6379 @ redis-master 172.16.1.51 6379
2938:X 27 Sep 2023 12:19:58.144 * +failover-state-wait-promotion slave 172.16.1.52:6379 172.16.1.52 6379 @ redis-master 172.16.1.51 6379
2938:X 27 Sep 2023 12:19:58.379 # +promoted-slave slave 172.16.1.52:6379 172.16.1.52 6379 @ redis-master 172.16.1.51 6379
2938:X 27 Sep 2023 12:19:58.379 # +failover-state-reconf-slaves master redis-master 172.16.1.51 6379
2938:X 27 Sep 2023 12:19:58.451 * +slave-reconf-sent slave 172.16.1.53:6379 172.16.1.53 6379 @ redis-master 172.16.1.51 6379
2938:X 27 Sep 2023 12:19:59.084 # -odown master redis-master 172.16.1.51 6379
2938:X 27 Sep 2023 12:19:59.392 * +slave-reconf-inprog slave 172.16.1.53:6379 172.16.1.53 6379 @ redis-master 172.16.1.51 6379
2938:X 27 Sep 2023 12:19:59.392 * +slave-reconf-done slave 172.16.1.53:6379 172.16.1.53 6379 @ redis-master 172.16.1.51 6379
2938:X 27 Sep 2023 12:19:59.455 # +failover-end master redis-master 172.16.1.51 6379
2938:X 27 Sep 2023 12:19:59.455 # +switch-master redis-master 172.16.1.51 6379 172.16.1.52 6379
2938:X 27 Sep 2023 12:19:59.455 * +slave slave 172.16.1.53:6379 172.16.1.53 6379 @ redis-master 172.16.1.52 6379
2938:X 27 Sep 2023 12:19:59.455 * +slave slave 172.16.1.51:6379 172.16.1.51 6379 @ redis-master 172.16.1.52 6379
2938:X 27 Sep 2023 12:20:29.473 # +sdown slave 172.16.1.51:6379 172.16.1.51 6379 @ redis-master 172.16.1.52 6379
2938:X 27 Sep 2023 12:28:29.754 # -sdown slave 172.16.1.51:6379 172.16.1.51 6379 @ redis-master 172.16.1.52 6379
2938:X 27 Sep 2023 12:28:39.786 * +convert-to-slave slave 172.16.1.51:6379 172.16.1.51 6379 @ redis-master 172.16.1.52 6379
```
## 参数解释

### SDOWN 和 ODOWN
sentinel有两种不同的停机概念， 一种是客观停机(Subjectively Down)，也就是SDOWN，一种是主观停机(Objectively Down)，也就是ODOWN

* 集群中的sentinel会每秒向每个已知的master、slave和sentinel发送ping请求，如果在指定的间隔时间内没有接收到redis实例的ping回复，即视为主观停机；
* ping回复的类型为：+PONG、-LOADING、-MASTERDOWN
* 如果master确认处于SDOWN状态，则每秒使用``SENTINEL is-master-down-by-addr``命令，向其他的sentinel节点确认Master的状态
* 如果其他的sentinel节点，对master的状态记录也为SDOWN，则返回``TRUE``
* 当master为SDOWN状态，并且有足够的sentinel节点返回为True(达到配置文件中``sentinel monitor``参数所指定的数量)，则Master被标记为ODOWN(客观停机)
* 只有Master才有ODOWN状态，当完成主从切换后，日志中会出现``-ODOWN``，这意味这当前实例已不再是master身份，因此退出ODOWN状态。

### 选举failover的领导者
* vote-for-leader：sentinel正在选举负责进行主从切换的领导者；
* elected-leader：显示被选出的领导者。

### failover-state-select-slave 故障转移状态：提升一个slave为master
* selected-slave: 选中的slave
* failover-state-send-slaveof-noone: 为选中的slave执行``slaveof noone``使其脱离slave状态
* failover-state-wait-promotion：角色转换中
* promoted-slave：报告leader以完成角色转换

### failover-state-reconf-slaves 故障转移状态：重写slave配置
* slave-reconf-sent：将REPLICAOF命令发送到实例
* slave-reconf-inprog：正在配置slave复制新的ip:port
* slave-reconf-done：slave以与新master完成同步  

### 故障转移完成
* failover-end：完成故障转移
* +slave：检测到并附加了新的slave
* convert-to-slave: 检测到原matser上线，将其转换为slave身份并和新master同步。
