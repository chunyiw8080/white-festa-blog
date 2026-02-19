---
title: Redis针对常见WARNING的优化
published: 2023-08-15
pinned: false
description: 描述了几种Redis日志中常见的警报和整改措施
tags: [Redis]
category: 数据库
draft: false
---

## 链接数警告

``WARNING: The TCP backlog setting of 511 cannot be enforced because /proc/sys/net/core/somaxconn is set to the lower value of 128.``

这个警告的主要内容是告知当前的TCP backlog的设置值太低，只有128； TCP Backlog是队列保留的链接挂起数，当多个客户端连接到服务器时，服务器会将传入的请求保存在一个队列中。客户端排列在队列中，服务器随着queue-member的进行，一个一个地处理他们的请求。这种连接的性质称为排队连接。

128是一个很短的值，如果请求量比较大的话，可能会导致触发大量的TCP重传，导致网络带宽的拥塞，因此，将TCP Backlog设置为一个恰当的值是有必要的。具体方法：

编辑``/etc/sysctl.conf``文件，加入一行配置：
``` bash
net.core.somaxconn=1024
```
然后使用``sysctl -p``命令重载配置，最后重启redis-server，可以发现该警告已经消失。


## 内存使用过载未开启警告

``WARNING overcommit_memory is set to 0! Background save may fail under low memory condition. To fix this issue add 'vm.overcommit_memory = 1' to /etc/sysctl.conf and then reboot or run the command 'sysctl vm.overcommit_memory=1' for this to take effect.``

这个警告是告知用户当前系统未开启内存过载。overcommit_memory参数确定系统是否允许超出物理 RAM 和交换空间的内存分配。当它设置为0时，意味着内核将在允许内存分配请求之前总是检查是否有足够的总内存(RAM + 交换区)。否则，分配请求将失败并出现内存不足错误。<br>
由于Redis高度依赖内存使用，该参数设置为0时会导致系统内存的使用效率低下，可能导致Redis在Fork子进程以进行BGSAVE时失败，甚至可能引起Redis崩溃。<br>
通过将该参数设定为1可以消除此警告；修改``etc/sysctl.conf``文件并将该参数的值设定为1.
``` bash
vm.overcommit_memory=1
```
然后使用``sysctl -p``命令重载配置，最后重启redis-server，可以发现该警告已经消失。

## 禁用透明大页警告

``WARNING you have Transparent Huge Pages (THP) support enabled in your kernel. This will create latency and memory usage issues with Redis. To fix this issue run the command 'echo never > /sys/kernel/mm/transparent_hugepage/enabled' as root, and add it to your /etc/rc.local in order to retain the setting after a reboot. Redis must be restarted after THP is disabled.``

透明大页(简称THP)是Linux的一种内存管理系统，它通过使用较大的内存页来减少具有大量内存的计算机上的转换后备缓冲区 (TLB) 查找的开销。<br>

默认情况下，一个内存分页的大小为4KB，在开启THP的情况下，一个内存大页为2MB；这么看来THP能够减少内存分配的次数，也可以增加子进程fork时的速度，但是，由于redis采用的写时复制的机制，一旦有数据需要被修改，redis不会直接修改内存数据，而是copy一份该数据并进行修改；<br>

这就导致了，在THP开启的情况下，即使要修改的数据直有2KB，redis也要复制一个2MB的内存大页，这意味着单次复制的开销是关闭内存大页时的上百倍，会严重拖慢写操作的执行时间，因此，redis官方建议是关闭THP以增强写性能。

### 解决方法
临时关闭：
``` bash
echo never > /sys/kernel/mm/transparent_hugepage/enabled
```

永久关闭：
编辑``/etc/rc.local``文件，加上如下代码
``` bash
if test -f /sys/kernel/mm/redhat_transparent_hugepage/enabled; then
  echo never > /sys/kernel/mm/redhat_transparent_hugepage/enabled
fi
```

验证THP状态：
```
[root@db-51 /opt/redis/logs]#cat /sys/kernel/mm/transparent_hugepage/enabled
always madvise [never]
```

---

重启redis后
```
6783:C 16 Aug 2023 21:44:38.219 # oO0OoO0OoO0Oo Redis is starting oO0OoO0OoO0Oo
6783:C 16 Aug 2023 21:44:38.219 # Redis version=5.0.7, bits=64, commit=00000000, modified=0, pid=6783, just started
6783:C 16 Aug 2023 21:44:38.219 # Configuration loaded
6784:M 16 Aug 2023 21:44:38.220 * Increased maximum number of open files to 10032 (it was originally set to 1024).
6784:M 16 Aug 2023 21:44:38.221 * Running mode=standalone, port=6379.
6784:M 16 Aug 2023 21:44:38.221 # Server initialized
6784:M 16 Aug 2023 21:44:38.221 * Ready to accept connections
```

可以发现之前的警告都已经消失。
