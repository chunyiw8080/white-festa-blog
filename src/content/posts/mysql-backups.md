---
title: MySQL备份
published: 2022-12-21
pinned: false
description: 如何通过Binlog和GTID实现数据备份和还原
tags: [MySQL]
category: 数据库
draft: false
langs: zh-CN
---

## Binlog日志

Binlog是一个二进制格式的文件，用于记录用户对数据库更新的SQL语句信息。<br>
例如,更改数据库库表和更改表内容的SQL语句都会记录到binlog里，但是对库表等内容的查询则不会记录到日志中。<br>
Binlog记录的语句类型：
* DML：insert update delete
* DDL：create drop alter    truncate
* DCL：grant revoke

### 查看MySQL是否开启的Binlog功能
登录数据库后，查看binlog相关参数：
``` txt
mysql> show variables like '%log_bin%';
+---------------------------------+-------+
| Variable_name                   | Value |
+---------------------------------+-------+
| log_bin                         | OFF   |
| log_bin_basename                |       |
| log_bin_index                   |       |
| log_bin_trust_function_creators | OFF   |
| log_bin_use_v1_row_events       | OFF   |
| sql_log_bin                     | ON    |
+---------------------------------+-------+
6 rows in set (0.00 sec)
```
可以看到目前binlog是关闭状态的；在此状态下，对数据库的任何操作都不会被记录，所有的备份功能都依赖于用户使用``mysqldump``命令进行手动备份。

### 开启binlog功能
需要修改MySQL配置文件``/etc/my.cnf``来实现：
``` txt
[mysqld]
server_id=52 #主机ID，唯一
log_bin=/mysql_data/bin_log/mysql-bin #binlog日志文件路径，最后binlog日志的文件名是mysql-bin.000001
character_set_server=utf8mb4
port=3306
user=mysql
basedir=/opt/mysql
datadir=/mysql_data/mysql_3306
socket=/tmp/mysql.sock

[mysql]
socket=/tmp/mysql.sock
```
重启mysqld后，再通过``show variables like '%log_bin%';``查看，可以发现log_bin已经是开启状态。

### binlog常用命令

#### 查看binlog日志文件信息
该命令会显示binlog的日志列表和每个日志的文件大小。
``` sql
show binary logs;
```

#### 刷新新日志文件
每次执行该命令，当前正在使用的binlog日志会被终止使用，并新建一个binlog日志用于新的记录。
``` sql
flush logs;
```

#### 查看当前正在使用的日志及其相关信息

``` sql
show master status;
```

#### 查看日志的记录内容(事件)

``` sql
show binlog events in 'binlog文件名'
```

例如：
``` txt
mysql> mysql> show binlog events in 'mysql-bin.000001';
+------------------+-----+----------------+-----------+-------------+---------------------------------------+
| Log_name         | Pos | Event_type     | Server_id | End_log_pos | Info                                  |
+------------------+-----+----------------+-----------+-------------+---------------------------------------+
| mysql-bin.000001 |   4 | Format_desc    |        52 |         123 | Server ver: 5.7.28-log, Binlog ver: 4 |
| mysql-bin.000001 | 123 | Previous_gtids |        52 |         154 |                                       |
| mysql-bin.000001 | 154 | Anonymous_Gtid |        52 |         219 | SET @@SESSION.GTID_NEXT= 'ANONYMOUS'  |
| mysql-bin.000001 | 219 | Query          |        52 |         322 | create database test_db               |
+------------------+-----+----------------+-----------+-------------+---------------------------------------+
4 rows in set (0.00 sec)
```
可以看到一个创建数据库的操作被记录了下来。

#### 解码binlog日志
由于binlog是二进制文件，所以我们是不能直接查看日志文件的；MySQL提供了``mysqlbinlog``命令，可以对日志文件进行解码供用户阅读。<br>
```
mysqlbinlog mysql-bin.000001
```

### 实践：模拟使用binlog进行数据恢复

#### 创建测试数据

``` sql
CREATE TABLE USER(
        id INT(11) NOT NULL auto_increment comment 'id',
        name VARCHAR(20) NOT NULL comment 'name',
        age TINYINT(2) NOT NULL comment 'age',
        primary key (id)
)engine=innodb default charset=utf8mb4;

INSERT INTO test_db.USER(name, age) VALUES('Mike',21);
INSERT INTO test_db.USER(name, age) VALUES('Lee',18);
INSERT INTO test_db.USER(name, age) VALUES('John',30);
INSERT INTO test_db.USER(name, age) VALUES('Sarah',19);
INSERT INTO test_db.USER(name, age) VALUES('Bob',22);
```


#### 模拟：数据库误删除
查看binlog日志的起点和终点pos值
``` sql
show binlog events in 'mysql-bin.000001'；
```
起点：154；终点：2122

使用``mysqlbinlog``命令，将这段的记录导出
``` bash
mysqlbinlog --start-position=154 --stop-position=2223 /mysql_data/bin_log/mysql-bin.000001 > ~/restore.sql
```

登录MySQL数据库，临时关闭binlog功能，防止数据恢复时重复写入记录。
``` sql
set sql_log_bin=0;
```
使用``source``命令将sql文件重新写入
``` sql
source /root/restore.sql
```
最后重新开启binlog ``set sql_log_bin=0;``

#### 跨日志文件恢复数据
假如有5个binlog日志文件，从mysql-bin.000001到mysql-bin.000005，其中被删除的日志的起始pos为mysql-bin.000001的225，终止pos为mysql-bin.000005的1779。<br>
那么其实回复方法是一样的:
```
mysqlbinlog --start-position=225 --stop-position=1779 mysql-bin.000001 mysql-bin.000002 mysql-bin.000003 mysql-bin.000004 mysql-bin.000005 mysql-bin.000006 > /root/restore.sql
```
``mysqlbinlog``命令在处理多个日志文件时会默认应用startPos的值为第一个日志文件，stopPos的值为最后一个日志文件。<br>
最后在数据库中source这个sql文件就可以完成数据恢复了；不要忘记在恢复前临时关闭binlog记录功能。

## 基于GTID的binlog

### 什么是基于GTID的binlog
GTID是从 MySQL 5.6.5 开始新增的复制方式，通过 GTID 保证了每个在主库上提交的事务在集群中有一个唯一的ID；这种方式强化了数据库的主备一致性，故障恢复以及容错能力。<br>

在原来基于二进制日志的复制中，从库需要告知主库要从哪个偏移量pos值进行增量同步，如果指定错误会造成数据的遗漏，从而造成数据的不一致；借助GTID，在发生主备切换的情况下，MySQL的其它从库可以自动在新主库上找到正确的复制位置，这大大简化了复杂复制拓扑下集群的维护，也减少了人为设置复制位置发生误操作的风险。<br>

另外，基于GTID的复制可以忽略已经执行过的事务，减少了数据发生不一致的风险。

### 什么是事务
事务是用于处理操作量较大的操作。
#### 特性
* 原子性：一个事务（transaction）中的所有操作，要么全部完成，要么全部不完成，不会结束在中间某个环节。事务在执行过程中发生错误，会被回滚（Rollback）到事务开始前的状态，就像这个事务从来没有执行过一样。
* 一致性：在事务开始之前和事务结束以后，数据库的完整性没有被破坏。
* 隔离性：数据库允许多个并发事务同时对其数据进行读写和修改的能力，隔离性可以防止多个事务并发执行时由于交叉执行而导致数据的不一致。
* 持久性：事务处理结束后，对数据的修改就是永久的，即便系统故障也不会丢失。<br>

#### 支持
MySQL中只有Innodb引擎的数据库和表才支持事务

#### 事务作用的语句
事务用来管理 INSERT,UPDATE,DELETE 语句

#### mysql默认的事务规则
在MySQL数据库中，事务默认是会自动提交的，也就是说，如果没有用 begin ... commit 来显式提交事务的话，MySQL 会认为每一条SQL语句都是一个事务，也就是每一条SQL语句都会自动提交。

### GTID的组成
GTID (Global Transaction ID) 是一个已提交事务的编号，并且是一个全局唯一的编号。<br>
GTID由两部分组成：UUID+TID<br>
* UUID 是一个 MySQL 实例的唯一标识
* TID 代表了该实例上已经提交的事务数量，并且随着事务提交单调递增

### 开启GTID功能

修改配置文件
``` txt
[mysqld]
gtid-mode=ON
enforce-gtid-consistency=true
log-slave-updates=ON
```
创建一个测试数据库后，通过``show master status``查看当前日志，可以发现
``` txt
mysql> show master status;
+------------------+----------+--------------+------------------+----------------------------------------+
| File             | Position | Binlog_Do_DB | Binlog_Ignore_DB | Executed_Gtid_Set                      |
+------------------+----------+--------------+------------------+----------------------------------------+
| mysql-bin.000004 |      325 |              |                  | f568445a-3cb2-11ee-b227-000c29da9fe9:1 |
+------------------+----------+--------------+------------------+----------------------------------------+
1 row in set (0.00 sec)
```
Executed_Gtid_Set字段不再是空白的，其中``f568445a-3cb2-11ee-b227-000c29da9fe9:1``这个值正好的``uuid:tid``的格式。

### 事务控制语句
* BEGIN：显示开启一个事务
* COMMIT：提交事务，使修改成为永久性的
    使用SET AUTOCOMMIT=0/1来禁止或者开启自动提交
* Rollback：回滚，结束事务并撤销该事务内的所有操作
* SAVEPOINT：设置一个保存点，一个事务内可以有多个保存点
* RELEASE SAVEPOINT：删除保存点
* ROLLBACK TO：回滚至指定保存点
* SET TRANSACTION：设定事务的隔离级别

显示开启一个事务，向t1表中插入数据
``` sql
begin;
insert into t1 values(1);
insert into t1 values(2);
insert into t1 values(3);
commit;

mysql> show binlog events in 'mysql-bin.000004';
+------------------+-----+----------------+-----------+-------------+-------------------------------------------------------------------+
| Log_name         | Pos | Event_type     | Server_id | End_log_pos | Info                                                              |
+------------------+-----+----------------+-----------+-------------+-------------------------------------------------------------------+
| mysql-bin.000004 |   4 | Format_desc    |        52 |         123 | Server ver: 5.7.28-log, Binlog ver: 4                             |
| mysql-bin.000004 | 123 | Previous_gtids |        52 |         154 |                                                                   |
| mysql-bin.000004 | 154 | Gtid           |        52 |         219 | SET @@SESSION.GTID_NEXT= 'f568445a-3cb2-11ee-b227-000c29da9fe9:1' |
| mysql-bin.000004 | 219 | Query          |        52 |         325 | create database test2_db                                          |
| mysql-bin.000004 | 325 | Gtid           |        52 |         390 | SET @@SESSION.GTID_NEXT= 'f568445a-3cb2-11ee-b227-000c29da9fe9:2' |
| mysql-bin.000004 | 390 | Query          |        52 |         495 | use `test2_db`; create table t1(id int)                           |
| mysql-bin.000004 | 495 | Gtid           |        52 |         560 | SET @@SESSION.GTID_NEXT= 'f568445a-3cb2-11ee-b227-000c29da9fe9:3' |
| mysql-bin.000004 | 560 | Query          |        52 |         636 | BEGIN                                                             |
| mysql-bin.000004 | 636 | Table_map      |        52 |         685 | table_id: 108 (test2_db.t1)                                       |
| mysql-bin.000004 | 685 | Write_rows     |        52 |         725 | table_id: 108 flags: STMT_END_F                                   |
| mysql-bin.000004 | 725 | Table_map      |        52 |         774 | table_id: 108 (test2_db.t1)                                       |
| mysql-bin.000004 | 774 | Write_rows     |        52 |         814 | table_id: 108 flags: STMT_END_F                                   |
| mysql-bin.000004 | 814 | Table_map      |        52 |         863 | table_id: 108 (test2_db.t1)                                       |
| mysql-bin.000004 | 863 | Write_rows     |        52 |         903 | table_id: 108 flags: STMT_END_F                                   |
| mysql-bin.000004 | 903 | Xid            |        52 |         934 | COMMIT /* xid=18 */                                               |
+------------------+-----+----------------+-----------+-------------+-------------------------------------------------------------------+
15 rows in set (0.00 sec)
```

可以看出，手动开启事务后，三个insert语句是被当成一组事务来看待的。

### 基于GTID截取日志
有了gtid之后，再也不用关心日志的开始pos，结束pos了，一个gtid记录，记录一个事务。
``` bash
mysqlbinlog  --skip-gtids  --include-gtids='GTID号' binlog文件路径  > rollback.sql
```

## 使用mysqldump和binlog组合进行数据备份
mysqldump是专门进行数据库备份的命令，通过mysqldump，数据可以被导出为一个SQL文件。<br>
通常我们会使用mysqldump和binlog(GTID)进行组合备份，例如每天晚上0点对数据库进行一次全量备份(mysqldump)，在两次备份之间使用binlog进行增量备份。

### mysqldump
用法：
``` bash
#备份所有库
mysqldump -uroot -pwww.yuchaoit.cn -S /data/3306/mysql.sock -F -A -B |gzip >/server/backup/mysqlbak_$(date+%F).sql.gz

#备份单个库
mysqldump -uroot -pwww.yuchaoit.cn -S /data/3306/mysql.sock -F -B oldboy|gzip >/server/backup/mysqlbak_$(date+%F).sql.gz
```

参数：
* -F： 备份前，刷新binlog日志，用于增量恢复(相当于flush logs)
* -B： 备份指定的某些数据库
* -A： 备份所有库、表、数据

对于数据量比较大的库或有频繁写入操作的库，一般还需要在备份时进行锁表，确保数据一致性；
可以使用-x参数进行锁库或全局锁(取决于是要备份单个库，还是全部数据)。

