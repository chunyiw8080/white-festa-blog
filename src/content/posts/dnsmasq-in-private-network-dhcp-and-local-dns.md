---
title: 一台 dnsmasq 搞定内网：自动分配 IP + 自动域名解析
published: 2025-12-22
pinned: false
description: 在小型实验环境或虚拟机集群中，dnsmasq 可以同时承担 DHCP 和 DNS 的角色，实现 IP 自动分配与主机名解析。本文基于 Linux Fedora + Hyper-V虚拟机，完整演示 dnsmasq 的部署、配置方法，以及如何实现基于 hostname 的自动域名解析与内网服务发现。
tags: [DHCP,DNS]
category: Networks
draft: false
---

# 一、dnsmasq简介
dnsmasq是一个轻量级的dhcp + dns服务，非常适合用在小型本地虚拟机集群中（小于300个终端设备），或者依靠其静态DHCP功能为虚拟机做初始化网络设置。


dnsmasq主要有两个功能
1. DHCP服务器：通过监听局域网中的DHCP广播请求，根据客户端的MAC地址分配IP地址，并维护租约信息（lease），IP范围、租期等均可通过配置文件定义；
2. DNS域名解析服务器：同网段中的其他服务器可以通过将dnsmasq所在IP设置为DNS地址实现本地主机的解析，此解析通常不需要手动维护传统的``/etc/hosts``文件，可以通过DHCP自动注册主机名，或通过额外的 hosts文件实现集中管理；

# 二、部署dnsmasq服务
## 1. 实验环境
### 网段
虚拟网络交换机网段：192.168.100.0/24，其中：
|Gateway |Broadcast|Static IP Addresses|DHCP IP Addresses|
|:--:|:--:|:--:|:--:|
|192.168.100.1|192.168.100.255|192.168.100.2 - 192.168.100.100|192.168.100.102 - 192.168.100.130|

### 主机
三台主机：
|-|dnsmasq |haproxy|exp-02|
|:--:|:--:|:--:|:--:|
|系统|Linux Fedora 43|Linux Fedora 43|Linux Fedora 42|
|网络类型|Static IP|DHCP|Static IP|
|IP地址|192.168.100.101|动态获取|192.168.100.2|
|hostname|dnsmasq-101|haproxy|exp-02|

## 2. 部署dnsmasq
1. 安装
```bash
# 安装
yum install dnsmasq -y
# 开机自启
systemctl enable --now dnsmasq
```
2. 创建配置文件 /etc/dnsmasq.conf
```text
# 服务用户和用户组配置
user=dnsmasq
group=dnsmasq

# 额外配置文件
conf-dir=/etc/dnsmasq.d,.rpmnew,.rpmsave,.rpmorig

# 绑定网卡、监听端口
interface=eth0
bind-interfaces
listen-address=192.168.100.101,127.0.0.1

# 本地search domain
domain=cluster.hyperv
local=/cluster.hyperv/
# expand-hosts: 自动为短主机名补全域名（就是上面的cluster.hyperv）
# 本质上是将 DHCP/hosts 中的短主机名自动扩展为 FQDN（Fully Qualified Domain Name）；
expand-hosts 

# 外部DNS服务器
server=223.5.5.5
server=223.6.6.6

# dnsmasq的hosts解析文件，可以将不受dnsmasq管理的静态ip写入到这里
addn-hosts=/etc/dnsmasq.hosts

# DHCP分配的IP范围、子网掩码、租约时长
dhcp-range=192.168.100.102,192.168.100.130,255.255.255.0,12h

# 告知客户端：网关 + DNS 指向自己
dhcp-option=option:router,192.168.100.1
dhcp-option=option:dns-server,192.168.100.101

# DHCP租约日志文件
dhcp-leasefile=/var/log/dhcp.leases

# DHCP日志的内容和日志文件路径
log-dhcp
log-queries
log-facility=/var/log/dnsmasq.log
```
3. 重启dnsmasq使配置文件生效
```bash
systemctl restart dnsmasq
```

# 三、创建新主机并使用DHCP网络配置
## 1. 创建新主机
这里使用hyper-v管理器创建，具体方法不说了，按流程就行；
## 2. 应用DHCP
在虚拟机初始化时，网络配置选择DHCP，如果无误，应该会立刻获取一个随机IP地址
![网络配置](https://images.white-festa.net/file/posts/dhcp/1774512661446_ScreenShot_2026-03-26_141440_333.png)
## 3. 安装后完成基础配置
完成hostname，软件源等基础配置

# 四、实现自动域名解析
## 1. 静态DHCP域名解析
静态DHCP域名解析是最简单的一种方法，只需要更新dnsmasq配置文件，增加一行配置，就可以将一个IP持久的固定分配给一台虚拟机，不受dnsmasq重启或者虚拟机重启影响。


在dnsmasq.conf中增加：
```text
# static DHCP
dhcp-host=00:15:5d:1a:01:16,haproxy,192.168.100.117
```
其中：
- ``00:15:5d:1a:01:16``是虚拟机的MAC地址，可以通过``ip link show``命令查看；
- haproxy是主机名，或者说局域网域名
- 192.168.100.117可以是一个未被占用的IP，也可以是当前分配给此虚拟机的IP


另外，dhcp-host 中指定的 hostname 会被 dnsmasq 用于注册 DNS 记录，
因此客户端无论实际 hostname 是什么，都可以通过该名称访问；

但客户端自身的 hostname 是否与该值一致，取决于其 DHCP 配置是否接受服务器下发的 hostname。

:::tip
为确保一致性，这里建议让vm hostname = dnsmasq为其设置的hostname，或者干脆就不设置hostname，取决于具体使用场景。
:::

之后，重启dnsmasq就可以实现IP的静态绑定。

## 2. 动态DHCP域名绑定
如果不想配置静态DHCP，用动态DHCP的方式一样可以实现域名绑定，不过需要在haproxy主机上做一些额外的配置。


通常，在安装虚拟机时，如果在网络配置中已经设定好了hostname，那么这个hostname会在虚拟机获取IP分配后自动推送给dnsmasq服务器（前提是DHCP客户端会发送hostname选项，大多数Linux发行版默认支持）；


但是如果hostname是通过``hostnamectl``等方式在虚拟机创建成功后修改的，则需要将hostname主动推给dnsmasq，具体方法如下：
```bash
# 修改配置
nmcli connection modify eth0 ipv4.dhcp-hostname "haproxy"
# 应用配置
nmcli connection up eth0
```

# 五、测试访问
在Fedora中，需要做以下调整才能正常实现基于dnsmasq的局域网域名解析
## 1. 修改DNS服务器
使用nmcli将DNS服务器指向dnsmasq主机
```bash
# 修改配置
nmcli connection modify eth0 ipv4.dns 192.168.100.101
# 应用配置
nmcli connection up eth0
```
## 2. 配置 systemd-resolved
在Fedora 42/43 中，[systemd-resolved](https://wiki.archlinux.org/title/Systemd-resolved) 接管了 DNS，默认情况下，DNS请求会先发送到本地的 127.0.0.53（systemd-resolved），如果未正确配置上游DNS，则不会转发到 dnsmasq；
```bash
# 告诉 systemd-resolved 对 cluster.hyperv 域名转发给 dnsmasq
resolvectl dns eth0 192.168.100.101
resolvectl domain eth0 cluster.hyperv
```
确认配置：
```text
[root@exp-02 ~]# resolvectl status eth0
Link 2 (eth0)
    Current Scopes: DNS LLMNR/IPv4 LLMNR/IPv6
         Protocols: +DefaultRoute LLMNR=resolve -mDNS -DNSOverTLS DNSSEC=no/unsupported
Current DNS Server: 192.168.100.101
       DNS Servers: 192.168.100.101
        DNS Domain: cluster.hyperv
     Default Route: yes
```
## 3. 验证
在exp-02上用nslookup验证：
```text
[root@exp-02 ~]# nslookup  haproxy.cluster.hyperv
Server:		127.0.0.53
Address:	127.0.0.53#53

Non-authoritative answer:
Name:	haproxy.cluster.hyperv
Address: 192.168.100.117
```
从结果可以看出，不使用任何额外配置和本地hosts解析，仅依靠一台dnsmasq服务器就可以完成从IP分配到局域网域名解析的全流程


:::tip
这里显示 Non-authoritative answer 是因为 dnsmasq 并不是该域的权威DNS服务器，而是基于本地数据返回结果；
:::

# 六、使用dnsmasq.hosts文件解析外部主机
对于使用静态IP的主机，正常来说是无法通过本地hosts文件以外的方式解析到对方的；



但是通过一个``dnsmasq.hosts``文件，可以让所有将dnsmasq设置为dns服务器的主机自动解析到这个文件中声明的所有主机；


创建``dnsmasq.hosts``，写入:
```text
192.168.100.1    gateway.cluster.hyperv   gateway
192.168.100.101  dns.cluster.hyperv       dns
192.168.100.2    exp-02.cluster.hyperv    exp-02
```
在haproxy主机上进行验证，尝试ping exp-02主机：
```text
[root@haproxy ~]# ping -c 3 exp-02
PING exp-02.cluster.hyperv (192.168.100.2) 56(84) bytes of data.
64 bytes from exp-02.cluster.hyperv (192.168.100.2): icmp_seq=1 ttl=64 time=0.240 ms
64 bytes from exp-02.cluster.hyperv (192.168.100.2): icmp_seq=2 ttl=64 time=0.351 ms
64 bytes from exp-02.cluster.hyperv (192.168.100.2): icmp_seq=3 ttl=64 time=0.380 ms
```

不依靠任何本地解析文件，也可以实现基于局域网域名的互相解析。

# 七、查看租约信息
在配置文件中，已经声明了lease文件路径为``/var/log/dhcp.lease``,可以直接查看
```text
[root@dnsmasq-101 etc]# cat /var/log/dhcp.leases
1774554322 00:15:5d:1a:01:16 192.168.100.117 haproxy 01:00:15:5d:1a:01:16
```
1774554322是一个时间戳，可以通过date查看可读时间
```text
[root@dnsmasq-101 etc]# date -d @1774554322
Fri Mar 27 03:45:22 AM CST 2026
```
租约到期时间为3月27日凌晨03:45:22，正好对应的是12个小时的租期。