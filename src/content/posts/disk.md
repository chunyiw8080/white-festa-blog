---
title: Linux磁盘分区
published: 2022-06-25
pinned: false
description: 关于磁盘插入后服务器不识别的处置方法、磁盘分区、挂载及文件系统格式化
tags: [磁盘]
category: Linux
draft: false
---

在服务器日常运行服务的过程中磁盘空间可能会变的越来越小，有一种可能是因为日志太多了，只要清理日志文件即可，也有可能是静态文件服务器中存放的内容越来越多，这些东西也没办法删减，所以只能对磁盘进行扩容。

# 插入新磁盘后服务器不识别
有两种解决方法：<br>
1. 如果服务本身使用者很少，对于可用性需求没有那么高的话，直接重启服务器就可以了。
2. 对于比较重要的服务器，不能重启，可以通过重新扫描SCSI总线的方式添加设备：

``` bash
# 查看主机总线号
ls /sys/class/scsi_host/
# 重新扫描SCSI总线
echo "- - -" > /sys/class/scsi_host/host0/scan
echo "- - -" > /sys/class/scsi_host/host1/scan
echo "- - -" > /sys/class/scsi_host/host2/scan
...
```
然后通过``lsblk``命令应该能看到新安装的硬盘。
以shell脚本扫描SCSI总线

``` bash
sum=$(ll /sys/class/scsi_host/host* | wc -l)
for ((i=0; i<${sum}; i++))
do
    echo "- - -" > /sys/class/scsi_host/host${i}/scan
done
```

# 查看占用磁盘空间最大的目录
基于du命令的深度查询参数，在根目录下执行以下命令
``` bash
du -h --max-depth=1
```
执行此命令可以得出当前目录的下一级中占用最大磁盘空间的目录。

# 磁盘分区 - MBR类型
## MBR类型特点
1. 不支持2T以上硬盘
2. 最多支持4个主分区
3. fdisk命令只能创建MBR分区
## 使用fdisk命令创建磁盘分区
``` bash
[root@web-7 /]#fdisk /dev/sdb
Welcome to fdisk (util-linux 2.23.2).

Changes will remain in memory only, until you decide to write them.
Be careful before using the write command.


Command (m for help): p #列出分区表

Disk /dev/sdb: 10.7 GB, 10737418240 bytes, 20971520 sectors
Units = sectors of 1 * 512 = 512 bytes
Sector size (logical/physical): 512 bytes / 512 bytes
I/O size (minimum/optimal): 512 bytes / 512 bytes
Disk label type: dos
Disk identifier: 0x25b1f0fc

   Device Boot      Start         End      Blocks   Id  System

Command (m for help): n #添加新分区
Partition type:
   p   primary (0 primary, 0 extended, 4 free)
   e   extended
Select (default p): p # 选择添加主分区(系统引导)
Partition number (1-4, default 1): # 分区编号：使用默认值
First sector (2048-20971519, default 2048): # 其实扇区：使用默认值
Using default value 2048
Last sector, +sectors or +size{K,M,G} (2048-20971519, default 20971519): +256M # 赋予该主分区256M的磁盘空间
Partition 1 of type Linux and of size 256 MiB is set

Command (m for help): p

Disk /dev/sdb: 10.7 GB, 10737418240 bytes, 20971520 sectors
Units = sectors of 1 * 512 = 512 bytes
Sector size (logical/physical): 512 bytes / 512 bytes
I/O size (minimum/optimal): 512 bytes / 512 bytes
Disk label type: dos
Disk identifier: 0x25b1f0fc

   Device Boot      Start         End      Blocks   Id  System
/dev/sdb1            2048      526335      262144   83  Linux

Command (m for help): n #添加新分区
Partition type:
   p   primary (1 primary, 0 extended, 3 free)
   e   extended
Select (default p): e # 选择添加扩展分区
Partition number (2-4, default 2): 
First sector (526336-20971519, default 526336): 
Using default value 526336
Last sector, +sectors or +size{K,M,G} (526336-20971519, default 20971519): 
Using default value 20971519 # 将全部的剩余空间给这个分区
Partition 2 of type Extended and of size 9.8 GiB is set

Command (m for help): p

Disk /dev/sdb: 10.7 GB, 10737418240 bytes, 20971520 sectors
Units = sectors of 1 * 512 = 512 bytes
Sector size (logical/physical): 512 bytes / 512 bytes
I/O size (minimum/optimal): 512 bytes / 512 bytes
Disk label type: dos
Disk identifier: 0x25b1f0fc

   Device Boot      Start         End      Blocks   Id  System
/dev/sdb1            2048      526335      262144   83  Linux
/dev/sdb2          526336    20971519    10222592    5  Extended

Command (m for help): n #添加新分区
Partition type:
   p   primary (1 primary, 1 extended, 2 free)
   l   logical (numbered from 5)
Select (default p): l # 添加逻辑分区
Adding logical partition 5
First sector (528384-20971519, default 528384): 
Using default value 528384
Last sector, +sectors or +size{K,M,G} (528384-20971519, default 20971519): 
Using default value 20971519 # 将扩展分区的全部磁盘给这个逻辑分区
Partition 5 of type Linux and of size 9.8 GiB is set

Command (m for help): p

Disk /dev/sdb: 10.7 GB, 10737418240 bytes, 20971520 sectors
Units = sectors of 1 * 512 = 512 bytes
Sector size (logical/physical): 512 bytes / 512 bytes
I/O size (minimum/optimal): 512 bytes / 512 bytes
Disk label type: dos
Disk identifier: 0x25b1f0fc

   Device Boot      Start         End      Blocks   Id  System
/dev/sdb1            2048      526335      262144   83  Linux
/dev/sdb2          526336    20971519    10222592    5  Extended
/dev/sdb5          528384    20971519    10221568   83  Linux

Command (m for help): w #！！！！ 写入之前的操作 ！！！！！
The partition table has been altered!

Calling ioctl() to re-read partition table.
Syncing disks.
```
然后可以看到新的磁盘文件了
``` bash
[root@web-7 /]#lsblk
NAME            MAJ:MIN RM  SIZE RO TYPE MOUNTPOINT
sda               8:0    0   20G  0 disk 
├─sda1            8:1    0    1G  0 part /boot
└─sda2            8:2    0   19G  0 part 
  ├─centos-root 253:0    0   17G  0 lvm  /
  └─centos-swap 253:1    0    2G  0 lvm  
sdb               8:16   0   10G  0 disk 
├─sdb1            8:17   0  256M  0 part 
├─sdb2            8:18   0    1K  0 part 
└─sdb5            8:21   0  9.8G  0 part #新的磁盘(逻辑分区)
sr0              11:0    1  4.4G  0 rom  
```
## 格式化文件系统
目前这个磁盘还是无法使用的，因为还没有文件系统；XFS是Centos7开始使用的默认文件系统。我们可以将新的磁盘格式化为这个系统使用
``` bash
[root@web-7 /]#mkfs.xfs /dev/sdb5
meta-data=/dev/sdb5              isize=512    agcount=4, agsize=638848 blks
         =                       sectsz=512   attr=2, projid32bit=1
         =                       crc=1        finobt=0, sparse=0
data     =                       bsize=4096   blocks=2555392, imaxpct=25
         =                       sunit=0      swidth=0 blks
naming   =version 2              bsize=4096   ascii-ci=0 ftype=1
log      =internal log           bsize=4096   blocks=2560, version=2
         =                       sectsz=512   sunit=0 blks, lazy-count=1
realtime =none                   extsz=4096   blocks=0, rtextents=0
```
## 挂载磁盘
格式化后还需要将新磁盘挂载在某个目录下，这样我们才能够访问到这块磁盘；这个目录就像Windows我的电脑中的D盘E盘目录一样。

### 临时挂载
``` bash
mount /dev/sdb5 /diskB
```
使用这种挂载方法，服务器重启后会失去挂载，必须重新进行手动挂载。

### 配置自动挂载
需要将配置写入到``/etc/fstab``文件中
``` bash
# 配置语法
挂载设备 挂载点 文件系统 挂载参数 是否备份 是否检查 
# 将sdb5磁盘挂载到/diskB目录下，写入配置文件
/dev/sdb5 /diskB xfs defaults 0 0
```
#### 挂载参数
挂载参数其实就是``mount -o``命令可附加的挂载选项
|参数|含义|
|:----:|:----:|
|async|以异步方式处理文件系统I/O操作，数据不会同步写入磁盘，而是写到缓冲区，提高系统性能，但损失数据安全性|
|sync|所有I/O操作同步处理，数据同步写入磁盘，性能较弱，数据安全性高|
|atime/noatime|文件被访问时是否修改时间戳，不更改时间，可以提高磁盘I/O速度|
|auto/noauto|通过-a参数可以自动被挂载/不自动挂载|
|defaults|默认值包括rw、suid、dev、exec、auto、nouser、async，/etc/fstab大多默认值|
|exec/noexec|是否允许执行二进制程序，取消提供安全性|
|suid/nosuid|是否允许suid(特殊权限)生效|
|user/nouser|是否允许普通用户挂载|
|remount|重新挂载|
|ro|只读|
|rw|读写|

# 磁盘分区 - GPT(GUID)类型
## GPT类型特点
1. 支持2TB以上硬盘
2. GPT分区表，没有扩展分区的类型，只有主分区和逻辑分区。
3. 可以使用parted命令，将GPT分区表类型转换为MBR类型

## 使用gdisk命令创建GPT类型的分区
``` bash
[root@web-7 ~]#gdisk /dev/sdb
GPT fdisk (gdisk) version 0.8.10

Partition table scan:
  MBR: not present
  BSD: not present
  APM: not present
  GPT: not present

Creating new GPT entries.

Command (? for help): p #查看分区列表
Disk /dev/sdb: 20971520 sectors, 10.0 GiB
Logical sector size: 512 bytes
Disk identifier (GUID): 5C1FE704-60A3-4D3B-8F91-8C9782B0FAF6
Partition table holds up to 128 entries
First usable sector is 34, last usable sector is 20971486
Partitions will be aligned on 2048-sector boundaries
Total free space is 20971453 sectors (10.0 GiB)
# 目前还没有分区
Number  Start (sector)    End (sector)  Size       Code  Name


Command (? for help): n #增加一个分区
Partition number (1-128, default 1): 
First sector (34-20971486, default = 2048) or {+-}size{KMGTP}: #起始扇区：默认值
Last sector (2048-20971486, default = 20971486) or {+-}size{KMGTP}: +1G #最后一个扇区：直接分给他1G
Current type is 'Linux filesystem'
Hex code or GUID (L to show codes, Enter = 8300):  # 创建GUID
Changed type of partition to 'Linux filesystem'

Command (? for help): p #查看分区列表
Disk /dev/sdb: 20971520 sectors, 10.0 GiB
Logical sector size: 512 bytes
Disk identifier (GUID): 5C1FE704-60A3-4D3B-8F91-8C9782B0FAF6
Partition table holds up to 128 entries
First usable sector is 34, last usable sector is 20971486
Partitions will be aligned on 2048-sector boundaries
Total free space is 18874301 sectors (9.0 GiB)

# 可以发现有了一个分区
Number  Start (sector)    End (sector)  Size       Code  Name
   1            2048         2099199   1024.0 MiB  8300  Linux filesystem

Command (? for help): n #增加一个分区
Partition number (2-128, default 2): 
First sector (34-20971486, default = 2099200) or {+-}size{KMGTP}: 
Last sector (2099200-20971486, default = 20971486) or {+-}size{KMGTP}: #将所有剩余空间分给这个分区
Current type is 'Linux filesystem'
Hex code or GUID (L to show codes, Enter = 8300):  #创建GUID
Changed type of partition to 'Linux filesystem'

Command (? for help): w #将之前的操作写入

Final checks complete. About to write GPT data. THIS WILL OVERWRITE EXISTING
PARTITIONS!!

Do you want to proceed? (Y/N): y #确认写入
OK; writing new GUID partition table (GPT) to /dev/sdb.
The operation has completed successfully.
```
## 验收分区
``` bash
[root@web-7 ~]#lsblk
NAME            MAJ:MIN RM  SIZE RO TYPE MOUNTPOINT
sda               8:0    0   20G  0 disk 
├─sda1            8:1    0    1G  0 part /boot
└─sda2            8:2    0   19G  0 part 
  ├─centos-root 253:0    0   17G  0 lvm  /
  └─centos-swap 253:1    0    2G  0 lvm  
sdb               8:16   0   10G  0 disk 
├─sdb1            8:17   0    1G  0 part 
└─sdb2            8:18   0    9G  0 part 
sr0              11:0    1  4.4G  0 rom  
```

## 格式化文件系统
这次将这块硬盘格式化为Ext4格式
``` bash
mkfs.ext4 /dev/sdb2
```

## 挂载
写入挂载配置
``` bash
echo "/dev/sdb2 /diskb ext4 defaults 0 0" >> /etc/fstab
```
生效挂载配置
``` bash
mount -a
```

# 将GPT类型转为MBR类型
基于parted命令
``` bash
[root@web-7 ~]#parted /dev/sdb
GNU Parted 3.1
Using /dev/sdb
Welcome to GNU Parted! Type 'help' to view a list of commands.
(parted) mktable msdos #转换磁盘类型
Warning: The existing disk label on /dev/sdb will be destroyed and all data on this disk will
be lost. Do you want to continue?
Yes/No? yes                                                               
(parted) p                                                                
Model: VMware, VMware Virtual S (scsi)
Disk /dev/sdb: 10.7GB
Sector size (logical/physical): 512B/512B
Partition Table: msdos
Disk Flags: 

Number  Start  End  Size  Type  File system  Flags

(parted) quit                                                             
Information: You may need to update /etc/fstab.
```

# 将MBR类型的磁盘转换为MBR
基于gdisk命令
``` 
[root@web-7 ~]#gdisk /dev/sdb
GPT fdisk (gdisk) version 0.8.10

Partition table scan:
  MBR: MBR only
  BSD: not present
  APM: not present
  GPT: not present

#这里提示如果转换会重写整个磁盘，如果是误操作可以直接按q退出
***************************************************************
Found invalid GPT and valid MBR; converting MBR to GPT format
in memory. THIS OPERATION IS POTENTIALLY DESTRUCTIVE! Exit by
typing 'q' if you don't want to convert your MBR partitions
to GPT format! 
***************************************************************


Command (? for help): w #写入操作

Final checks complete. About to write GPT data. THIS WILL OVERWRITE EXISTING
PARTITIONS!!

Do you want to proceed? (Y/N): Y
OK; writing new GUID partition table (GPT) to /dev/sdb.
The operation has completed successfully.
```


