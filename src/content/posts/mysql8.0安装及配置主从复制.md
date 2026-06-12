---
title: MySQ8.0安装、初始化以及主从复制配置
published: 2025-02-22
pinned: false
description: MySQL8.0数据库的安装、初始化以及配置基于GTID的一主二从教程
tags: [MySQL]
category: 数据库
draft: false
---

# 背景
MySQL 5.7已于2023年10月31日结束官方支持（EOL），并且随着官方开始大力推行“去奴隶化”（由“master/slave”改为“source/replica”），8.0版本和5.7版本已经存在显著的语法差异，因此从长远来看，有必要将主力MySQL迁移至8.0版本。


此外，从8.0版本开始，MySQL内置了innodb cluster，可以代替MHA成为内置的高可用技术。


虽然MySQL 8.4才是当前LTS版本，但8.0与8.4架构差异较小，因此从 8.0 升级到 8.4 的成本较低，8.0当前仍然有使用价值。


[MySQL 5.7的主从复制配置](https://white-festa.net/posts/mysql-replica-mha/)
# 安装MySQL 8.0
## 一、下载二进制包并解压
```bash
wget https://dev.mysql.com/get/Downloads/MySQL-8.0/mysql-8.0.45-linux-glibc2.28-x86_64.tar.xz
tar -xf mysql-8.0.45-linux-glibc2.28-x86_64.tar.xz
# 重命名目录
mv mysql-8.0.45-linux-glibc2.28-x86_64 mysqld
```

## 二、修改环境变量
```bash
echo 'export PATH=/opt/mysqld/bin:$PATH' >> /etc/profile
source /etc/profile
```

## 三、创建MySQL用户
```bash
groupadd mysql
useradd -r -g mysql -s /bin/false mysql
```

## 四、创建MySQL数据目录并修改属主属组为mysql
```bash
mkdir /data/mysql
chown -R mysql:mysql /data/mysql
```

## 五、配置systemd服务文件
```bash
# 创建文件
touch /etc/systemd/system/mysqld.service 
# 写入配置
cat > /etc/systemd/system/mysqld.service << EOF
[Unit]
Description=MySQL Server
After=network.target

[Service]
Type=simple
User=mysql
Group=mysql
ExecStart=/opt/mysqld/bin/mysqld \
  --defaults-file=/etc/my.cnf \
  --basedir=/opt/mysqld \
  --datadir=/data/mysql

LimitNOFILE=5000

[Install]
WantedBy=multi-user.target
EOF
```
## 六、创建my.cnf配置文件
```ini
[client]
port = 3306
socket = /tmp/mysql.sock

[mysqld]
# 基础
user = mysql
port = 3306
basedir = /opt/mysqld
datadir = /data/mysql
socket = /tmp/mysql.sock
pid-file = /data/mysql/mysql.pid

# 网络
bind-address = 0.0.0.0
max_connections = 200

# 字符集
character-set-server = utf8mb4
collation-server = utf8mb4_0900_ai_ci

# InnoDB（核心）
default_storage_engine = InnoDB
innodb_buffer_pool_size = 1G
innodb_buffer_pool_instances = 1
innodb_log_file_size = 512M
innodb_flush_method = O_DIRECT
innodb_flush_log_at_trx_commit = 1

# 日志
log_error = /data/mysql/error.log
slow_query_log = 1
slow_query_log_file = /data/mysql/slow.log
long_query_time = 2

# 主从复制
log_bin = mysql-bin
server-id = 1
relay_log = relay-bin # Master库不需要此参数
binlog_format = ROW
binlog_expire_logs_seconds = 604800

# 防止从库写入（仅可用于从库）
read_only = 1
super_read_only = 1

gtid_mode = ON
enforce_gtid_consistency = ON

# 其他
skip_name_resolve = 1
sql_mode = STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION
```
:::tip
注意：每个MySQL实例的配置文件中的 ``server-id``必须唯一，以此区分不同实例，如果相同，在主从复制和fail over时会出错
:::

## 七、初始化MySQL数据库
```bash
mysqld --initialize --user=mysql --datadir=/data/mysql
```
完成后，会输出如下文本：
```text
2026-03-04T12:00:24.537198Z 0 [System] [MY-013169] [Server] /opt/mysqld/bin/mysqld (mysqld 8.0.45) initializing of server in progress as process 23840
2026-03-04T12:00:24.546014Z 1 [System] [MY-013576] [InnoDB] InnoDB initialization has started.
2026-03-04T12:00:25.408554Z 1 [System] [MY-013577] [InnoDB] InnoDB initialization has ended.
2026-03-04T12:00:26.989315Z 6 [Note] [MY-010454] [Server] A temporary password is generated for root@localhost: keE/1t:?crlP
```
:::tip
最后一行显示了数据库首次登入可用的临时密码，可以将其保存下来，未来如果要重建此刻的检查点，通过这个文件中保存的密码可以登录并完成其余配置。
:::

## 八、启动MySQL服务
```bash
systemctl daemon-reload
systemctl start mysqld && systemctl status mysqld
```

## 九、登录并修改root用户密码
```bash
musql -uroot -pkeE/1t:?crlP
ALTER USER 'root'@'localhost' IDENTIFIED BY 'new-passoword';
```

# 配置主从复制

## 一、在Master(Source)节点上创建repl账户
```sql
CREATE USER 'repl'@'%' IDENTIFIED BY 'password';
GRANT REPLICATION SLAVE ON *.* TO 'repl'@'%';
```

## 二、让从库选择主库
### 1. 在所有从库中执行
```text
mysql> CHANGE REPLICATION SOURCE TO
    -> SOURCE_HOST='master_ip_address',
    -> SOURCE_USER='repl',
    -> SOURCE_PASSWORD='repl_password',
    -> SOURCE_AUTO_POSITION=1;
```
其中 ``SOURCE_AUTO_POSITION=1``是启用基于 GTID 的自动定位复制的核心参数（在 MySQL 8.0 之前称为 MASTER_AUTO_POSITION）。


此时，MySQL复制就不再依赖手动指定的binlog文件名和起始偏移量（MASTER_LOG_FILE/MASTER_LOG_POS），而是基于GTID集合来自动同步数据，即``uuid:index``形式

### 2. 然后开启复制
```sql
START REPLICA;
```
### 3. 此操作在新旧版本上的语法差异
| 旧                | 新                           |
| ----------------- | ---------------------------- |
| CHANGE MASTER TO  | CHANGE REPLICATION SOURCE TO |
| START SLAVE       | START REPLICA                |
| STOP SLAVE        | STOP REPLICA                 |
| SHOW SLAVE STATUS | SHOW REPLICA STATUS          |

### 4. 可选项：为已经执行过许多事务的主库开启复制
当我们用备份文件搭建一个新的 GTID 从库时，主库上已经执行过很多事务（对应一组 GTID）。如果从库直接恢复备份并启动复制，它并不知道哪些事务已经存在，可能会再次请求并尝试执行那些事务，导致数据冲突或复制中断。
使用此命令：
```bash
mysqldump --single-transaction --set-gtid-purged=ON
```
- ``--single-transaction``: 对于使用 InnoDB 的表，在备份开始时开启一个事务，利用 MVCC（多版本并发控制）获得一致性快照。备份过程中不会锁表，不影响业务读写。
- ``--set-gtid-purged=ON``: 在生成的备份文件中加入 ``SET @@GLOBAL.GTID_PURGED`` 语句，该语句会将主库当前已执行过的 GTID 集合（通过 ``SHOW MASTER STATUS`` 获取）设置为从库的 ``gtid_purged`` 值。
#### 示例:
1. 在主库上执行备份
```bash
mysqldump --single-transaction --set-gtid-purged=ON --all-databases --master-data=2 > backup.sql
```
2. 将备份文件传输到从库并恢复
```bash
mysql < backup.sql
```
3. 在从库上配置复制并启动

# 主从复制常用操作
## 一、查看主从复制状态
在Master节点上：
```sql
SHOW REPLICAS;
```
显示为：
```text
mysql> SHOW REPLICAS;
+-----------+------+------+-----------+--------------------------------------+
| Server_Id | Host | Port | Source_Id | Replica_UUID                         |
+-----------+------+------+-----------+--------------------------------------+
|         3 |      | 3306 |         1 | ba35b007-17c1-11f1-aad8-00155d1a0119 |
|         2 |      | 3306 |         1 | 8fc4a8f2-17bc-11f1-b8e4-00155d1a0118 |
+-----------+------+------+-----------+--------------------------------------+
```
这里Host值为空，是因为配置文件中没有配置``report-host``参数，需要修改配置文件，在``[mysqld]``区域下添加``report-host = 实例的ip地址``，然后重载配置

另一种方法是使用``SHOW PROCESSLIST\G``

```text
mysql> SHOW PROCESSLIST\G
*************************** 1. row ***************************
     Id: 5
   User: event_scheduler
   Host: localhost
     db: NULL
Command: Daemon
   Time: 2679
  State: Waiting on empty queue
   Info: NULL
*************************** 2. row ***************************
     Id: 8
   User: root
   Host: localhost
     db: NULL
Command: Query
   Time: 0
  State: init
   Info: SHOW PROCESSLIST
*************************** 3. row ***************************
     Id: 12
   User: repl
   Host: 192.168.100.11:48694
     db: NULL
Command: Binlog Dump GTID
   Time: 1870
  State: Source has sent all binlog to replica; waiting for more updates
   Info: NULL
*************************** 4. row ***************************
     Id: 13
   User: repl
   Host: 192.168.100.12:47120
     db: NULL
Command: Binlog Dump GTID
   Time: 1788
  State: Source has sent all binlog to replica; waiting for more updates
   Info: NULL
4 rows in set, 1 warning (0.00 sec)
```
其中Command=Binlog Dump GTID的线程所对应的HOST就是从库的ip地址。

## 二、查看主库状态
```text
mysql> show master status\G
*************************** 1. row ***************************
             File: mysql-bin.000002
         Position: 1323
     Binlog_Do_DB: 
 Binlog_Ignore_DB: 
Executed_Gtid_Set: ba35bfac-17c1-11f1-a2f0-00155d1a0117:1-5
1 row in set (0.00 sec)
```
## 三、查看从库复制状态
```text
mysql> SHOW REPLICA STATUS\G
*************************** 1. row ***************************
             Replica_IO_State: Waiting for source to send event
                  Source_Host: 192.168.100.2
                  Source_User: repl
                  Source_Port: 3306
                Connect_Retry: 60
              Source_Log_File: mysql-bin.000002
          Read_Source_Log_Pos: 1138
               Relay_Log_File: relay-bin.000002
                Relay_Log_Pos: 1354
        Relay_Source_Log_File: mysql-bin.000002
           Replica_IO_Running: Yes
          Replica_SQL_Running: Yes
              Replicate_Do_DB: 
          Replicate_Ignore_DB: 
           Replicate_Do_Table: 
       Replicate_Ignore_Table: 
      Replicate_Wild_Do_Table: 
  Replicate_Wild_Ignore_Table: 
                   Last_Errno: 0
                   Last_Error: 
                 Skip_Counter: 0
          Exec_Source_Log_Pos: 1138
              Relay_Log_Space: 1558
              Until_Condition: None
               Until_Log_File: 
                Until_Log_Pos: 0
           Source_SSL_Allowed: No
           Source_SSL_CA_File: 
           Source_SSL_CA_Path: 
              Source_SSL_Cert: 
            Source_SSL_Cipher: 
               Source_SSL_Key: 
        Seconds_Behind_Source: 0
Source_SSL_Verify_Server_Cert: No
                Last_IO_Errno: 0
                Last_IO_Error: 
               Last_SQL_Errno: 0
               Last_SQL_Error: 
  Replicate_Ignore_Server_Ids: 
             Source_Server_Id: 1
                  Source_UUID: ba35bfac-17c1-11f1-a2f0-00155d1a0117
             Source_Info_File: mysql.slave_master_info
                    SQL_Delay: 0
          SQL_Remaining_Delay: NULL
    Replica_SQL_Running_State: Replica has read all relay log; waiting for more updates
           Source_Retry_Count: 86400
                  Source_Bind: 
      Last_IO_Error_Timestamp: 
     Last_SQL_Error_Timestamp: 
               Source_SSL_Crl: 
           Source_SSL_Crlpath: 
           Retrieved_Gtid_Set: ba35bfac-17c1-11f1-a2f0-00155d1a0117:1-4
            Executed_Gtid_Set: ba35bfac-17c1-11f1-a2f0-00155d1a0117:1-4
                Auto_Position: 1
         Replicate_Rewrite_DB: 
                 Channel_Name: 
           Source_TLS_Version: 
       Source_public_key_path: 
        Get_Source_public_key: 0
            Network_Namespace: 
```
重点看：
| 字段                    | 正常值 |
| --------------------- | --- |
| Replica_IO_Running    | Yes |
| Replica_SQL_Running   | Yes |
| Seconds_Behind_Source | 0   |
