---
title: Redis数据持久化
published: 2023-05-21
pinned: false
description: 关于Redis的数据持久化方案的简单介绍 - 主要是RDB和AOF
tags: [Redis]
category: 数据库
draft: false
---

## 一、Redis的四种数据持久化方案
### RDB
快照/内存快照，根据一定的时间间隔将全部数据写入磁盘；<br>
优点：
* RDB文件是某个时间节点的快照，默认使用LZF算法进行压缩，压缩后的文件体积远远小于内存大小，适用于备份、全量复制等场景
* Redis加载RDB文件恢复数据要远远快于AOF方式；<br>

缺点:
* RDB方式实时性不够，无法做到秒级的持久化；
* 每次调用bgsave都需要fork子进程，fork子进程属于重量级操作，频繁执行成本较高；
* RDB文件是二进制的，没有可读性，AOF文件在了解其结构的情况下可以手动修改或者补全；
* 版本兼容RDB文件问题
### AOF
类似MySQL的BINLOG，以日志形式记录了对数据的增减和修改操作，可以通过日志还原数据；

优点：日志有可读性，安全性高；
缺点：文件较大，非二进制数据恢复速度较慢。

### 虚拟内存(VM)
从2.4版本开始Redis官方明确表示不建议使用VM持久化方案，从3.2版本开始不再提供VM持久化方案的范例

### DISKSTORE
DISKSTORE是在2.8版本提出的一个技术设想，目前没有任何LTS版本明确建议使用此方案，同时也没有相关的技术支持。

## 二、RDB数据快照
RDB数据快照基于两个命令：``SAVE``和``BGSAVE``

### SAVE
由于Redis是单线程的，在生产环境下数据量可能很大，使用SAVE会在一定时间内阻塞其他命令的执行。

### BGSAVE
即后台存储，redis主进程会执行fork操作创造一个子进程，RDB操作由这个子进程负责，完成后进程自动终止；在fork时会发生阻塞，但持续时间很短。<br>
具体流程如下：
* redis客户端执行bgsave命令或者自动触发bgsave命令； 
* 主进程判断当前是否已经存在正在执行的子进程，如果存在，那么主进程直接返回； 
* 如果不存在正在执行的子进程，那么就fork一个新的子进程进行持久化数据，fork过程是阻塞的，fork操作完成后主进程即可执行其他操作；
* 子进程先将数据写入到临时的rdb文件中，待快照数据写入完成后再原子替换旧的rdb文件；
* 同时发送信号给主进程，通知主进程rdb持久化完成，主进程更新相关的统计信息（info Persistence下的rdb_*相关选项）。

#### 手工触发BGSAVE
* 需要在配置文件中指定持久化数据文件的保存路径：``dir /path``
* 需要确保redis有权限访问此目录
* 使用redis-cli bgsave

#### 自动触发持久化

##### 触发持久化的四种情况
* 配置文件中配置了自动触发持久化参数；
* 主从复制时，从节点要从主节点进行全量复制时也会触发bgsave操作，生成当时的快照发送到从节点；
* 执行debug reload命令重新加载redis时也会触发bgsave操作；
* 默认情况下执行shutdown命令时，如果没有开启aof持久化，那么也会触发bgsave操作；

##### 修改配置文件，添加自动触发持久化参数
* 执行BGSAVE的时间频率<br>
    ``save M-seconds N-changes``: 在M秒内有N次修改时，触发持久化操作
* 持久化出错，主进程是否停止写入: ``stop-writes-on-bgsave-error yes/no``
* 是否压缩数据: ``rdbcompression yes/no``
* 导入时是否检查: ``rdbchecksum yes/no``
* RDB文件在磁盘上的名称: ``dbfilename``

#### RDB数据恢复
* 只要将rdb文件放入配置文件中声明的dir路径即可实现数据恢复。
* rdb文件名一定要和配置文件中的一致，如果配置文件中没有指定dbfilename，则必须是默认的文件名dump.rdb。

#### RDB不同情况下的进程终止触发持久化的问题

##### 没配置save参数
* shutdown/pkill/kill 都不会持久化数据
* 可以手动执行bgsave
##### 配置了save参数
* shutdown/pkill/kill 都会自动触发bgsave持久化
* 但是pkill -9 redis 不会持久化，因为通常的kill信号为15，是正常退出，进程终止前会进行持久化操作；kill -9为强制终止，不会触发持久化操作(因为进程直接没了)

### RDB总结
RDB持久化的优点
* RDB文件是某个时间节点的快照，默认使用LZF算法进行压缩，压缩后的文件体积远远小于内存大小，适用于备份、全量复制等场景；
* Redis加载RDB文件恢复数据要远远快于AOF方式；

缺点
* RDB方式实时性不够，无法做到秒级的持久化；
* 每次调用bgsave都需要fork子进程，fork子进程属于重量级操作，频繁执行成本较高；
* RDB文件是二进制的，没有可读性，AOF文件在了解其结构的情况下可以手动修改或者补全；
* 版本兼容RDB文件问题。

## 三、AOF日志
Redis是“写后”日志，Redis先执行命令，把数据写入内存，然后才记录日志。日志里记录的是Redis收到的每一条命令，这些命令是以文本形式保存。

### AOF日志记录的步骤
* 命令追加(Append)：服务器在执行完一个写命令之后，会以协议格式将被执行的写命令追加到服务器的 aof_buf 缓冲区。
* 文件写入(write)和文件同步(sync)

### 日志写入策略
基于三种写入策略将AOF_Buffer缓冲区内的数据写入到日志中
#### Always
每个命令执行完毕，立即同步写入日志到磁盘

优点：可靠性强，数据基本不丢
缺点：
* 每个命令都要写入日志磁盘，redis性能影响很大；
* 持续写入零散的数据到磁盘对磁盘的压力很大，由于磁头长期频繁的进行寻址，更容易造成磁盘老化；
* 磁盘与内存中存在巨大的读写速度差异，使用缓冲区可以一次性将大量数据写入，降低磁盘负荷。

#### Everysec
每个命令执行完毕，日志只会写入AOF文件的内存缓冲区，每隔一秒把缓冲区的日志写入到磁盘。
优点：性能和安全性平衡
缺点：宕机会丢失1秒内的数据

#### No
每个命令写完，日志只写入AOF文件的内存缓冲区，操作系统自由调度，持久化到磁盘。
优点：性能足够好
缺点：宕机时，不确定丢失的数据

*以上三种写入策略本质上是在可靠性和性能之间做取舍*

### 开启AOF功能
添加AOF参数到配置文件
* 开启AOF功能：``appendonly yes/no``
* 指定AOF文件名: ``appendfilename "redis_appendonly.aof"``（具体路径以dir参数为准）
* 指定buffer写入方式: ``appendfsync always/everysec/no``

## 四、RDB和AOF混合持久化
1. 混合持久化就是日志重写的一个步骤，主要通过底层bgrewriteaof重写日志，以及通过``aof-use-rdb-preamble yes/no``参数开启混合持久化功能。
2. 混合持久化后的日志，部分是rdb的二进制数据，部分是aof的可读数据
### 日志重写
在redis中使用BGREWRITEAOF命令重写AOF日志；重写后生成的AOF日志将剔除可读操作，将现有数据写为二进制RDB数据；
当再有新数据写入时，会自动在RDB数据下面写入AOF日志，直到再次通过BGREWRITEAOF命令，将上下两个部分合并为一段RDB数据。

### 自动进行日志重写的参数

#### auto-aof-rewrite-percentage
当新写入的数据大小相当于前一次写入的一定百分比时，执行日志重写，需要结合auto-aof-rewrite-min-size，设定一个进行重写的日志最小值
``` bash
auto-aof-rewrite-percentage 50
```
#### auto-aof-rewrite-min-size
启用日志重写的最小值，如果日志没有达到这个大小，那么即使满足了auto-aof-rewrite-percentage的设定也不会重写。
``` bash
auto-aof-rewrite-min-size 2mb
```
