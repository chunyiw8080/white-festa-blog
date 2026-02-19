---
title: Redis入门
published: 2023-05-17
pinned: false
description: Redis数据库的安装、基本命令和数据类型
tags: [Redis]
category: 数据库
draft: false
---

## 什么是redis
Redis即远程字典服务，是一个开源的使用ANSI C语言编写、支持网络、可基于内存亦可持久化的日志型、``Key-Value``数据库，并提供多种语言的API；redis会周期性的把更新的数据写入磁盘或者把修改操作写入追加的记录文件。
#### 为什么使用Redis
Redis是一种支持key-value等多种数据结构的存储系统，是基于内存的，读写速度很快，通常用于将查询成本比较高的数据将慢介质(磁盘)存储到快介质(内存)中，达到快速响应的效果；一些频繁被访问的数据，经常被访问的数据如果放在关系型数据库，每次查询的开销都会很大，而放在redis中，因为redis 是放在内存中的可以很高效的访问。

## Redis交互式安装脚本
``` bash
#/bin/bash

exec_dir=""

function create_dir(){
    mkdir -p /opt/redis/{conf,logs,pid,data}
}
function depandencies(){
    yum install gcc make -y
}
function install(){
    read -p $'软件源Url: \n' donwload_link
    wget ${donwload_link}
    tar -zxf redis*.tar.gz -C /opt

    read -p $'Redis可执行文件路径: \n' exec_dir
    if [ -z $exec_dir ]; then
        cd /opt/redis-* && make MALLOC=libc && make install
    else
        cd /opt/redis-* && make MALLOC=libc && make PREFIX=${exec_dir} install
    fi  
}
function make_conf(){
    touch /opt/redis/conf/redis.conf

    read -p $'Redis运行端口: \n' redis_port
    
    local local_ip=$(ifconfig eth1 | grep inet | grep -v 127.0.0.1 | grep -v inet6 | awk '{print $2}' | tr -d "addr:")
    local public_ip=$(ifconfig eth0 | grep inet | grep -v 127.0.0.1 | grep -v inet6 | awk '{print $2}' | tr -d "addr:")
# Reids配置文件
cat > /opt/redis/conf/redis.conf << EOF
daemonize yes 
bind 127.0.0.1 ${local_ip} ${public_ip}
port ${redis_port}
pidfile /opt/redis/pid/redis.pid
logfile /opt/redis/logs/redis.log
dir /opt/redis/data/ 
save 60 1000 
EOF
}
function create_user(){
    read -p $'Redis GID: \n' redis_gid
    read -p $'Redis UID: \n' redis_uid
    groupadd redis -g ${redis_gid}
    useradd redis -s /sbin/nologin -M -u ${redis_uid} -g ${redis_gid}

    chown -R redis.redis /opt/redis*
}
function systemd_script(){
    # Redis的服务控制脚本
    if [ -z ${exec_dir} ]; then
        exec_dir="/usr/local/bin"
    fi
touch /lib/systemd/system/redis.service
cat > /lib/systemd/system/redis.service << EOF
[Unit]
Description=Redis data server
After=syslog.target network.target remote-fs.target nss-lookup.target

[Service]
Type=forking
ExecStart=/bin/bash -c '${exec_dir}/redis-server /opt/redis/conf/redis.conf'
ExecStop=/bin/bash -c '${exec_dir}/redis-cli shutdown'
Restart=always
PrivateTmp=True

[Install]
WantedBy=multi-user.target
EOF
    systemctl daemon-reload
}
create_dir
depandencies
install
make_conf
create_user
systemd_script

systemctl start redis
redis-cli info server
```

## Redis基本命令

### Redis启动和关闭
启动Redis
``` bash
redis-server /配置文件
```
Redis客户端登入
``` bash
redis-cli -h ip_addr -p port
```
关闭Redis server

``` bash
# 在Redis交互界面中
shutdown save # 关闭并保存数据
shutdown nosave # 关闭并不保存数据

# 也可以免交互操作
redis-cli -h ip_addr -p port shutdown save
```

### info命令
info命令用于查看Redis的区块信息
``` bash
127.0.0.1:6379> info cpu
# CPU
used_cpu_sys:2.348677
used_cpu_user:2.014707
used_cpu_sys_children:0.000000
used_cpu_user_children:0.000000
```

### 切换库
Redis默认有16个数据库，编号从0到15，默认数据库为0号库。
使用SELECT INDEX切换数据库
``` bash
127.0.0.1:6379> SELECT 1
OK
127.0.0.1:6379[1]> 
```

### 删库
清空当前所在的库
``` bash
FLUSHDB
```
清空Redis的全部数据库
``` bash
FLUSHALL
```

## Redis五大数据类型
分别是：字符串类型、列表List(链表)、集合SET、哈希HASH和Zset有序集合

### 字符串类型
#### 命令
1. get,mget
2. set,mset
3. del
4. incr:将键存储的值加1
5. decr:将键存储的值减1
6. incrby：将键存储的值加上指定整数
7. decrby：将键存储的值减去指定整数
#### 字符串类型的常见用法
1. 数据缓存：
    把经常读取的url、字符串、音视频字符串等存储到redis内。redis作为缓存层，能够加速数据读取；同时将MySQL作为数据持久化层，降低mysql的访问压力。
    视频类url一般把视频文件存储到远端CDN服务器，并将链接转存在MySQL里，在用户读取视频时，通过前端JS加密处理让用户得到一个加密后的url，无法通过此url直接获得源文件。
2. 计数器：
    利用INCR/DECR实现增加点赞数、转发数等功能；
    由于redis是单线程模式，命令都是有序执行的，因此能够确保数据正确性。
3. 存储网站用户的登录会话session或token

### 列表List(链表)
#### List相关命令
1. LPUSH/RPUSH:将值从列表左/右端推入

``` bash
LPUSH/RPUSH key value
```

2. LPOP/RPOP:从列表左端/右端弹出一个值

``` bash
LPOP/RPOP key
```
    
3. LRANGE:获取给定范围内的列表的值

``` bash
LRANGE key index1 index2 (范围从0到-1显示列表内的所有值)
```
    
4. LINDEX:获得指定索引的值

``` bash
LINDEX key index
```
    
其中index为负时代表倒数的index。

#### 常见用法
1. 生产-消费者模型：
    通过LPUSH向消息队列中压入订单，通过RPOP弹出最老的订单并处理
2. 时间轴

### 集合SET
#### 特点
1. 集合内的所有元素唯一，天然去重
2. 集合是无序的
#### 相关命令
1. SADD:向集合内添加成员
2. SCARD:获取集合内的成员数
3. SMEMBERS:返回集合内的所有成员(如果集合内成员太多，存在阻塞的可能)
4. SISMEMBERS:判断member元素是否为集合的成员
5. SUNION:两个集合的并集
    并集：将两个集合合并为一个集合并去重

``` bash
SUNION key1 key2 ...
```

6. SINTER:两个集合的交集
    交集：两个元素共有的元素
7. SDIFF:反回第一个集合中独有的元素
#### 常见用法
1. 利用交集功能实现提示多个用户的共同关注
2. 利用去重功能实现不会对内容重复收藏、关注

### 哈希HASH
Redis Hash是一个string类型的field和value的映射表，Hash适合存储对象
#### 相关命令
HSET：添加键值对
``` bash
HSET hash_key filed1 value1 filed2 value2 ...
```
HGET: 获取指定散列键的值
``` bash
HGET hash_key filed_key
```
HMGET: 一次性查询多个key-value
``` bash
HGET hash_key filed_key1 filed_key2
```
HGETALL: 获取散列中包含的所有键值对<br>
HDEL: 如果给定键存在于散列中，那么就移除这个键
``` bash
HDEL hash_key filed_key1 filed_key2
```
HMSET: 一次性添加多个键值对
``` bash
HMSET hash_key filed1 value1 filed2 value2 ...
```

### Zset有序集合
Redis 有序集合和集合一样也是 string 类型元素的集合,且不允许重复的成员。不同的是每个元素都会关联一个 double 类型的分数。redis 正是通过分数来为集合中的成员进行从小到大的排序。
#### 相关命令
ZADD: 将一个带有给定分值的成员添加到有序集合里面
``` bash
ZADD key score member
```
ZRANGE: 根据元素在有序集合中所处的位置，从有序集合中获取多个元素(类似List列表的LRANGE)
``` bash
ZRANGE key start stop (从0到-1为显示全部元素)
```
使用WITHSCORES携带分数显示
ZREM: 如果给定元素成员存在于有序集合中，那么就移除这个元素
``` bash
ZREM key member
```
ZREVRANGE: 逆序显示集合元素
``` bash
ZREVRANGE key start stop (从0到-1为显示全部元素)
```
ZINCRBY: 为某个元素增加指定的分数(score)
``` bash
ZINCRBY key score member
```
ZRANK: 显示某个元素的序号
``` bash
ZRANK key member
```

## Redis安全控制
Redis作为缓存中间件，容易受到反序列化攻击，因此，如果Redis服务器要暴露在公网，必须启用安全模式，确保安全性。
### 开启安全模式
在配置文件中增加安全配置
``` bash
# 启用安全模式
protected-mode yes
# 设置密码
requirepass password
```
登录时使用-a参数输入密码或使用redis-cli进入交互后使用auth password输入密码。
### 以非root用户运行redis
修改服务控制脚本
``` bash
[Service]
User=redis
Group=redis
Type=forking
ExecStart=/bin/bash -c '/usr/local/bin/redis-server /opt/redis/conf/redis.conf'
ExecStop=/bin/bash -c '/usr/local/bin/redis-cli shutdown'
Restart=always
PrivateTmp=True
```

### 禁用危险命令
修改配置文件，使用rename-command指令关闭危险命令
``` bash
rename-command FLUSHALL "shdikahdka"
```
其实就是将危险命令修改为复杂字符串，防止误操作。