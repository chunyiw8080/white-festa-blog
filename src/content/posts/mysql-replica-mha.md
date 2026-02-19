---
title: MySQL主从复制(基于binlog和GTID)
published: 2023-01-05
pinned: false
description: 使用MySQL MHA结合Binlog或GTID实现MySQL数据库集群的数据同步
tags: [MySQL]
category: 数据库
draft: false
---

## MySQL主从复制
MySQL的主从复制是逻辑复制模式，从库将主库的binlog记录复制到本机并执行，以此保持数据一致性。<br>

主从服务器架构的设计，可以大大加强MySQL数据库架构的健壮性。例如，当主服务器出现问题时，我们可以人工切换或设置成自动切换到从服务器继续提供服务，此时从服务器的数据和宕机时的主数据库几乎是一致的。

### 一、常见主从复制模式
* 一主一从/一主多从
* 多主一从
只支持MySQL5.7以后的版本；将多个库的数据备份到单个库中存储。
* 双主库复制
两个数据库服务器互相做对方的主从；任何一方的数据有更改，另一方都会将其复制到自己的数据库中。
* 层级复制
适用于从库数量较多的场景；正常情况下，如果多个从库链接主库对主库服务器的压力比较大，因此引出多级复制的概念，最高级的自然是主库，然后以树状图的模式分出多级从库进行复制。

### 二、主从复制原理
主从复制依靠三个线程实现。<br>
主库：log dump - 用于给从库I/O线程传输binlog数据<br>
从库：I/O线程和SQL线程
* I/O线程：请求主库的binlog，并将得到的binlog写入自己的delay log中。
* SQL线程：读取delay log中的数据，解析为SQL并执行(写入数据)

#### 1. 主库log dump线程
主节点会为每个从节点创建一个log dump线程，其作用是读取和发送binlog内容，在读取binlog日志时，该线程会对binlog加锁，当完成读取发送给从节点之前，会释放锁。

#### 2. 从库 I/O线程和SQL线程

##### I/O线程
当从库节点执行start slave命令后，从节点会创建一个I/O线程来链接主库节点，请求主库更新的binlog，在接收到主库发来的binlog记录后，将其保存在本地的delay log中。

##### SQL线程
SQl线程负责读取delay log的记录，并将其解析为SQL语句，最终执行这些SQL语句来确实地写入数据。

#### 3. 什么是Delay log
Delay log一般翻译成中继日志，可以简单的理解为主从复制中暂存binlog记录的缓存区；因为中继日志的存在，在主库存在频繁的写入操作时，主节点不必等待从节点执行完上一条SQL记录后才能进行传输。

#### 4. 主从复制流程
* 从节点执行``slave start``开启主从复制。从节点的I/O线程链接主节点，并请求从指定日志文件的指定位置(或者从最开启的日志)之后的日志内容。
* 主节点收到从节点I/O线程的请求后，由log dump线程将从节点请求的日志内容返回给从节点；返回的信息中除了记录本身，还包括本次请求的binlog文件名和binlog position(Stop position,也就是下一个要读取的记录的start position)。
* 从节点的I/O线程接收到记录和信息后，将binlog记录更新到本机delay log的最末端；将binlog文件名和pos值保存到``master-info``文件中，后面从节点将根据这个文件内的信息向主节点发起新的请求。
* 从节点上的SQL线程检测到delay log更新后，会逐条将最新的记录解析为SQL语句并执行，并在``relay-log.info``文件中记录执行delay log的文件名和最新pos。

### 三、配置MySQL主从复制

#### 1. 环境准备

##### 主库 

|主机名|公网ip|内网ip|开启binlog|
|:----:|:----:|:----:|:----:|
|db-51|10.0.0.51|172.16.1.51|yes|<br>

配置：
``` bash
[mysqld]
port=3306
user=mysql
basedir=/opt/mysql
datadir=/mysql_data/mysql_3306
server_id=51
log_bin=/mysql_data/binlog/db51-bin
socket=/tmp/mysql.sock

[mysql]
socket=/tmp/mysql.sock
```

##### 从库

|主机名|公网ip|内网ip|开启binlog|
|:----:|:----:|:----:|:----:|
|db-52|10.0.0.52|172.16.1.52|no|

配置：
``` bash
[mysqld]
port=3306
user=mysql
basedir=/opt/mysql
datadir=/mysql_data/mysql_3306
socket=/tmp/mysql.sock

[mysql]
socket=/tmp/mysql.sock
```

#### 2. 为从节点创建链接主库的账号
在master机器上操作：
``` sql
grant replication slave on *.* to 'repl'@'172.16.1.%' identified by '123456';"
```
查看用户：
``` sql
mysql> select user,host,plugin from mysql.user;
+---------------+------------+-----------------------+
| user          | host       | plugin                |
+---------------+------------+-----------------------+
| root          | localhost  | mysql_native_password |
| mysql.session | localhost  | mysql_native_password |
| mysql.sys     | localhost  | mysql_native_password |
| repl          | 172.16.1.% | mysql_native_password |
+---------------+------------+-----------------------+
4 rows in set (0.00 sec)
```
查看用户权限：
``` sql
mysql> show grants for repl@'172.16.1.%';
+-------------------------------------------------------+
| Grants for repl@172.16.1.%                            |
+-------------------------------------------------------+
| GRANT REPLICATION SLAVE ON *.* TO 'repl'@'172.16.1.%' |
+-------------------------------------------------------+
1 row in set (0.00 sec)
```

#### 3. 备份主库的现有数据并发送到从库上
这步是为了让主从库的起始数据一致。
``` bash
mysqldump -uroot -pabc123 -A --master-data=2 --single-transaction -R -E --triggers --max_allowed_packet=64M > /root/db51-data.sql

scp /root/db51-data.sql root@172.16.1.52:/root
```

#### 4. slave机器导入数据
``` bash
mysql -uroot -pabc123 < db51-data.sql
```

#### 5. 开启主从复制
为slave机器指定要读取的master机器信息：
``` sql
mysql> change master to
    -> master_host='172.16.1.51',
    -> master_port=3306,
    -> master_user='repl',
    -> master_password='123456',
    -> master_log_file='db51-bin.000001',
    -> master_log_pos=2349,
    -> master_connect_retry=10;
Query OK, 0 rows affected, 2 warnings (0.01 sec)
```
参数：
* master_host：主节点ip，需要和之前为从库创建的复制账户处在相同网段，因为账户是针对内网网段授权的，如果链接的是公网IP，没有复制的权限。
* master_port：主节点端口号
* master_user和master_password：用于复制的账户和密码
* master_log_file：主节点的logfile文件名，确保和备份主库时正在用的日志一致就可以。
* master_log_pos：binlog日志的最新位置
* master_connect_retry：重连次数

然后开启主从复制
``` sql
mysql> start slave;
```
通过一条命令查看主从复制状态
``` yaml
mysql> show slave status \G
*************************** 1. row ***************************
               Slave_IO_State: Waiting for master to send event
                  Master_Host: 172.16.1.51
                  Master_User: repl
                  Master_Port: 3306
                Connect_Retry: 10
              Master_Log_File: db51-bin.000001
          Read_Master_Log_Pos: 2349
               Relay_Log_File: db-52-relay-bin.000002
                Relay_Log_Pos: 319
        Relay_Master_Log_File: db51-bin.000001
             Slave_IO_Running: Yes
            Slave_SQL_Running: Yes
              Replicate_Do_DB: 
          Replicate_Ignore_DB: 
           Replicate_Do_Table: 
       Replicate_Ignore_Table: 
      Replicate_Wild_Do_Table: 
  Replicate_Wild_Ignore_Table: 
                   Last_Errno: 0
                   Last_Error: 
                 Skip_Counter: 0
          Exec_Master_Log_Pos: 2349
              Relay_Log_Space: 526
              Until_Condition: None
               Until_Log_File: 
                Until_Log_Pos: 0
           Master_SSL_Allowed: No
           Master_SSL_CA_File: 
           Master_SSL_CA_Path: 
              Master_SSL_Cert: 
            Master_SSL_Cipher: 
               Master_SSL_Key: 
        Seconds_Behind_Master: 0
Master_SSL_Verify_Server_Cert: No
                Last_IO_Errno: 0
                Last_IO_Error: 
               Last_SQL_Errno: 0
               Last_SQL_Error: 
  Replicate_Ignore_Server_Ids: 
             Master_Server_Id: 51
                  Master_UUID: 06fdc979-3cb2-11ee-8345-000c29948844
             Master_Info_File: /mysql_data/mysql_3306/master.info
                    SQL_Delay: 0
          SQL_Remaining_Delay: NULL
      Slave_SQL_Running_State: Slave has read all relay log; waiting for more updates
           Master_Retry_Count: 86400
                  Master_Bind: 
      Last_IO_Error_Timestamp: 
     Last_SQL_Error_Timestamp: 
               Master_SSL_Crl: 
           Master_SSL_Crlpath: 
           Retrieved_Gtid_Set: 
            Executed_Gtid_Set: 
                Auto_Position: 0
         Replicate_Rewrite_DB: 
                 Channel_Name: 
           Master_TLS_Version: 
1 row in set (0.00 sec)
```
其中，``Slave_IO_Running``和``Slave_SQL_Running``两个选项代表着从库的I/O线程和SQL线程，这两个的值是yes，说明目前已经成功的建立了链接。

#### 6. 测试主从复制效果
在主库中新建一个数据库 test_db2
``` sql
CREATE DATABASE test_db2
```

在从库中查看
```
mysql> show databases;
+--------------------+
| Database           |
+--------------------+
| information_schema |
| mysql              |
| performance_schema |
| sys                |
| test_db            |
| test_db2           |
+--------------------+
6 rows in set (0.00 sec)
```
可以发现从库立刻进行了复制。

#### 7. 查看主从库上的线程

``` sql
show processlist;
```

##### 主库
```
mysql> mysql> show processlist;
+----+------+-------------------+------+-------------+------+---------------------------------------------------------------+------------------+
| Id | User | Host              | db   | Command     | Time | State                                                         | Info             |
+----+------+-------------------+------+-------------+------+---------------------------------------------------------------+------------------+
|  7 | repl | 172.16.1.52:53338 | NULL | Binlog Dump |  555 | Master has sent all binlog to slave; waiting for more updates | NULL             |
|  8 | root | localhost         | NULL | Query       |    0 | starting                                                      | show processlist |
+----+------+-------------------+------+-------------+------+---------------------------------------------------------------+------------------+
2 rows in set (0.00 sec)
```

##### 从库
```
mysql> show processlist;
+----+-------------+-----------+------+---------+------+--------------------------------------------------------+------------------+
| Id | User        | Host      | db   | Command | Time | State                                                  | Info             |
+----+-------------+-----------+------+---------+------+--------------------------------------------------------+------------------+
|  2 | root        | localhost | NULL | Query   |    0 | starting                                               | show processlist |
|  3 | system user |           | NULL | Connect |  584 | Waiting for master to send event                       | NULL             |
|  4 | system user |           | NULL | Connect |  135 | Slave has read all relay log; waiting for more updates | NULL             |
+----+-------------+-----------+------+---------+------+--------------------------------------------------------+------------------+
3 rows in set (0.00 sec)
```

## 主从复制之过滤复制

当主库上存在多个database，但从库只需要同步一部分的话就需要用到MySQL的复制过滤功能。<br>
比如一个主库承载多个业务数据库，需要将不同业务数据库复制到不同的从库进行查询以做到业务隔离的场景。<br>
通过过滤复制可以灵活的指定哪些库和表需要复制，哪些库不需要同步。<br>
通常在从服务器上配置过滤复制，可以减轻主库的负载。

### 如何配置过滤复制
修改slave实例配置，使用如下参数：
* replicate_do_db：数据库白名单列表，多个数据库用逗号分隔，该选项指定的数据库会执行主从复制操作
* replicate_ignore_db：数据库黑名单列表，该选项指定的数据库将不会被复制
* replicate_do_table：表级别的白名单
* replicate_ignore_table：表级别的黑名单
* replicate_wild_do_table：可以使用通配符进行指定白名单表，如%代表所有
* replicate_wild_ignore_table：可以使用通配符进行指定黑名单表，如%代表所有

### 通过修改配置文件
```
[mysqld]
port=3306
user=mysql
basedir=/opt/mysql
datadir=/mysql_data/mysql_3306
socket=/tmp/mysql.sock
server_id=52

replicate_do_db=test_db
[mysql]
socket=/tmp/mysql.sock
```

### 热配置
``` sql
mysql > stop slave sql_thread; 
mysql > change replication filter replicate_do_db=(test_db)
mysql > start slave sql_thread;
```

### 检查从库状态
``` yaml
mysql> show slave status\G;
*************************** 1. row ***************************
               Slave_IO_State: Waiting for master to send event
                  Master_Host: 172.16.1.51
                  Master_User: repl
                  Master_Port: 3306
                Connect_Retry: 10
              Master_Log_File: db51-bin.000001
          Read_Master_Log_Pos: 3748
               Relay_Log_File: db-52-relay-bin.000005
                Relay_Log_Pos: 841
        Relay_Master_Log_File: db51-bin.000001
             Slave_IO_Running: Yes
            Slave_SQL_Running: Yes
              Replicate_Do_DB: test_db
          Replicate_Ignore_DB: 
           Replicate_Do_Table: 
       Replicate_Ignore_Table: 
      Replicate_Wild_Do_Table: 
  Replicate_Wild_Ignore_Table: 
                   Last_Errno: 0
                   Last_Error: 
                 Skip_Counter: 0
          Exec_Master_Log_Pos: 3748
```
可以发现在Replicate_Do_DB字段中指定了要复制的数据库。

## 基于GTID的主从复制

### GTID复制原理流程
* master进行数据更新时，在事务前产生GTID号，一起记录到binlog日志。
* slave的I/O线程将变更的binlog数据，写入到本地中继日志relay_log
* slave的SQL线程从中继日志中获取GTID号，和本地的binlog对比查看是否有记录，如果有记录，说明该GTID事务已执行，slave数据库会忽略。
* 如果没有记录，slave数据库从relay_log中继日志中获取数据，且执行该GTID的事务，记录到binlog中

借助GTID，在发生主备切换的情况下，MySQL的其它从库可以自动在新主库上找到正确的复制位置，这大大简化了复杂集群的维护，也减少了人为设置复制位置发生误操作的风险。<br>
另外，基于GTID的复制可以忽略已经执行过的事务，减少了数据发生不一致的风险。

### 配置GTID主从复制
注意：如果要使用基于GTID的主从复制，则服务器集群中的所有主机都要开启GTID，不能混用。

#### 修改配置文件
master配置文件：
``` bash
[mysqld]
port=3306
user=mysql
basedir=/opt/mysql
datadir=/mysql_data/mysql_3306
server_id=51
log_bin=/mysql_data/binlog/db51-bin
socket=/tmp/mysql.sock

autocommit=0
binlog_format=row
gtid-mode=on 
enforce-gtid-consistency=true
log-slave-updates=1

[mysql]
socket=/tmp/mysql.sock
```

slave配置文件
``` bash
[mysqld]
port=3306
user=mysql
basedir=/opt/mysql
datadir=/mysql_data/mysql_3306
socket=/tmp/mysql.sock
server_id=52

autocommit=0
gtid-mode=on 
enforce-gtid-consistency=true
log-slave-updates=1

[mysql]
socket=/tmp/mysql.sock
```

#### 开启基于GTID的主从复制：
在slave上：
``` sql
change master to master_host='172.16.1.51', master_user='repl', master_password='123456', MASTER_AUTO_POSITION=1;
```

#### 查看复制是否一致
master状态：
``` txt
mysql> show master status;
+-----------------+----------+--------------+------------------+------------------------------------------+
| File            | Position | Binlog_Do_DB | Binlog_Ignore_DB | Executed_Gtid_Set                        |
+-----------------+----------+--------------+------------------+------------------------------------------+
| db51-bin.000002 |     2726 |              |                  | 3ecf8cda-3f30-11ee-b128-000c29948844:1-8 |
+-----------------+----------+--------------+------------------+------------------------------------------+
1 row in set (0.00 sec)

```
slave状态：
``` txt
mysql> show slave status \G;
*************************** 1. row ***************************
               Slave_IO_State: Waiting for master to send event
                  Master_Host: 172.16.1.51
                  Master_User: repl
                  Master_Port: 3306
                Connect_Retry: 60
              Master_Log_File: db51-bin.000002
          Read_Master_Log_Pos: 2726
               Relay_Log_File: db-52-relay-bin.000003
                Relay_Log_Pos: 1090
        Relay_Master_Log_File: db51-bin.000002
             Slave_IO_Running: Yes
            Slave_SQL_Running: Yes
              Replicate_Do_DB: 
          Replicate_Ignore_DB: 
           Replicate_Do_Table: 
       Replicate_Ignore_Table: 
      Replicate_Wild_Do_Table: 
  Replicate_Wild_Ignore_Table: 
                   Last_Errno: 0
                   Last_Error: 
                 Skip_Counter: 0
          Exec_Master_Log_Pos: 2726
              Relay_Log_Space: 3441
              Until_Condition: None
               Until_Log_File: 
                Until_Log_Pos: 0
           Master_SSL_Allowed: No
           Master_SSL_CA_File: 
           Master_SSL_CA_Path: 
              Master_SSL_Cert: 
            Master_SSL_Cipher: 
               Master_SSL_Key: 
        Seconds_Behind_Master: 0
Master_SSL_Verify_Server_Cert: No
                Last_IO_Errno: 0
                Last_IO_Error: 
               Last_SQL_Errno: 0
               Last_SQL_Error: 
  Replicate_Ignore_Server_Ids: 
             Master_Server_Id: 51
                  Master_UUID: 3ecf8cda-3f30-11ee-b128-000c29948844
             Master_Info_File: /mysql_data/mysql_3306/master.info
                    SQL_Delay: 0
          SQL_Remaining_Delay: NULL
      Slave_SQL_Running_State: Slave has read all relay log; waiting for more updates
           Master_Retry_Count: 86400
                  Master_Bind: 
      Last_IO_Error_Timestamp: 
     Last_SQL_Error_Timestamp: 
               Master_SSL_Crl: 
           Master_SSL_Crlpath: 
           Retrieved_Gtid_Set: 3ecf8cda-3f30-11ee-b128-000c29948844:1-8
            Executed_Gtid_Set: 3ecf8cda-3f30-11ee-b128-000c29948844:1-8
                Auto_Position: 1
         Replicate_Rewrite_DB: 
                 Channel_Name: 
           Master_TLS_Version: 
1 row in set (0.00 sec)
```
可以看到目前接收到的和已经执行了的GTID事务记录，并且主从库的gtid是一致的，因此我们可以判定两者的数据是同步的。

**注意**<br>
由于在配置文件中关闭了自动提交，因此部分操作(比如向表中插入数据)必须要使用显示事务提交的方式才可以让gtid记录正常增长；
