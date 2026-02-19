---
title: LNMP单机拆分为集群并对wordpress实现负载均衡
published: 2023-01-23
pinned: false
description: 从0到1实现Tomcat的负载均衡与Nginx动静态资源分离，配合ansible playbook做软件安装
tags: [WordPress, Nginx, 负载均衡]
category: Web架构

draft: false
---

## 一、集群架构
当网站流量达到一定程度时，单靠单机部署的模式就不能满足大流量所需求的性能了。因此，将单机模式拆分为负载均衡集群是很有必要，负载均衡集群需要至少五台服务器，其架构模型如下
![负载均衡集群](https://blog.freelytomorrow.com/articles_img/load-balancing-wordpress/structure.png)<br>

* lb-5：负载均衡器，该服务器作为反向代理服务器，负责将用户的http请求基于特定算法转发给web服务器进行解析和处理；部署nginx。
* web-7和web-8：两台web服务器，部署了nginx和php-fpm，负责解析静态和动态请求；
* nfs-31：静态资源服务器，负责存放静态文件资源，以wordpress举例，一个wordpress站点包含了大量图片和音视频资源，已经php脚本，如果分别部署在两台web服务器上，那么一定是行不通的，因为我们很难确保两台主机上的数据一致性，也不可能每次更新站点内容时都重复一遍相同的操作，使用nfs服务器，基于远程挂载操作，可以让两台web服务器操作相同的文件内容；
* db-51：数据库服务器
* rsync-31：备份服务器，该服务器并非必要的，rsync服务器主要是对涉及到交易等有高安全性和高数据可靠性需求的站点才有重要作用。
<br>
<br>

## 二、拆分LNMP单机为集群

### 部署wordpress源代码到nfs-31服务器<br>
由于这里使用的是虚拟机进行试验，因此并没有wordpress源代码，正常情况下进行拆分需要先将wordpress代码进行打包，并发送到nfs服务器上。
``` bash
mkdir /www; cd /www; wget https://cn.wordpress.org/latest-zh_CN.zip
```

### 部署NFS服务端
在nfs服务器上安装nfs-utils和rpcbind包并运行
``` bash
yum install nfs-utils rpcbind -y
systemctl start rpcbind
systemctl enable rpcbind
```

创建nfs配置文件
``` bash
cat > /etc/exports << EOF
/www/wordpress 172.16.1.0/24(rw,sync,all_squash) 
#rw - 可读可写 权限开放给172.16.1网段的所有ip 将nfs目录下的所有文件的属主重写为nfsnobody(即使是root创建的) 
EOF
```

修改nfs目录属主
```bash
chown -R nfsnobody.nfsnobody /www/wordpress/
```

启动nfs服务并设为开机自启
```bash
systemctl start nfs
systemctl enable nfs
```

可以使用showmount命令查看是否配置成功
```bash
showmount -e 172.16.1.31
```

### 在两台web服务器上部署NFS客户端(挂载)
安装nfs-utils工具包
```bash
yum install nfs-utils -y
```

重启rpcbind
```bash
systemctl restart rpcbind
```

这里的rpcbind应该默认是设为开机自启的，可以用is-enabled查看一下，如果不是就设成自启动。<br>
用showmount命令查看nfs服务器信息
```bash
showmount -e 172.16.1.31
```

如果一切正常会显示之前在/etc/exports中配置的信息。<br>
创建要挂载的目标目录并进行挂载：
```bash
mkdir /www; mount -t nfs 172.16.1.31:/www/wordpress /www
```

然后查看www目录，应该发现里面都是wordpress的文件<br>
最后一步，配置开机自动挂载
```bash
echo '172.16.1.31:/www/wordpress /www  nfs default 0 0' >> /etc/fstab
```

### 安装WordPress
在web服务器上运行php-fpm服务后，在浏览器中输入web服务器的IP地址，应该可以看到wordpress安装界面。<br>
这就说明已经挂载成功了。

### 为MySQL数据库创建远程连接用户和wordpress数据库
我们希望两台web服务器向同一个数据库内存储内容，因此必须将MySQL数据库拆分出来。<br>
使用下面的命令创建一个远程连接用户
``` bash
mysql -uroot -p123456 -e "grant all privileges on *.* to username@'%' identified by '123456'"
```

-e参数让我们可以在不登入服务器交互界面的情况下执行语句，这条命令的含义是：授权一个用于远程连接的用户名username，密码是123456，允许其在任何机器上远程登录到数据库并访问具有访问所有数据库和表的权限<br>
使用下面的命令创建数据库
```bash
mysql -uroot -p123456 -e "create database my_blog"
```

接下来填入信息<br>
用户名和密码填刚才创建的远程连接用户；数据库主机这次就不再是localhost了，因为它是远程部署的，输入ip:3306，3306是mysql默认占用的端口号。<br>
到此为止，我们的wordpress服务已经算是部署在了集群模式上了，下一步是部署反向代理服务器，让用户访问这台代理服务器，并由它将请求转发给web服务器。<br>
<br>
<br>

## 三、部署反向代理服务器

### 什么是反向代理
有反向代理当然就有正向代理；正向代理是指服务器代理客户端对服务端进行访问，在服务端的严重，代理服务器就是客户端，正向代理的一个典型应用是VPN，通过正向代理，用户可以绕过IP限制等技术手段对目标服务器进行访问，同时隐藏客户端本身的信息；<br>
反向代理则相反，代理服务器代理服务端接收客户端的请求，对于客户端来说，代理服务器就是服务端，负载均衡就是一个典型的应用；用户将请求发送给代理服务器，并由代理服务器将请求转发给web服务器进行处理。

### 部署服务器

#### 安装Nginx
``` bash
yum install nginx -y
```

#### 修改配置文件/etc/nginx/nginx.conf
配置如下：<br>
``` nginx
load_module /usr/lib64/nginx/modules/ngx_stream_module.so; #使用七层负载均衡upstream关键字需要引入此模块 
user nginx; 
worker_processes auto; 
user nginx; 
worker_processes auto; 
events{ 
    worker_connections 1024; 
}
http{ 
    upstream pool_web{
        server 172.16.1.7:80 weight=1; 
        server 172.16.1.9:80 weight=4;
    } 
    server { 
        listen 80; 
        server_name _; 
        location / { 
            proxy_pass http://pool_web; #将请求转发给服务器池中的主机(默认基于轮询算法) 
            include /etc/nginx/proxy_params.conf; #引入反向代理参数 
        } 
    } 
}
```

#### 配置反向代理参数
``` nginx
proxy_set_header Host $http_host; #服务器将用户访问网站的hosts信息转发给后端节点 
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; #将用户真实的ip传递给后端的节点 
proxy_connect_timeout 30; #proxy和server的连接超时，要求不超过30s；
proxy_send_timeout 60; #proxy等待server回传数据的超时时间 
proxy_read_timeout 60; #proxy等待server响应的超时; 
proxy_buffering on; #把server返回的数据先放入缓冲区，然后再返回给client，一边收数据，一边传递，而不是全部接收完再传递 
proxy_buffer_size 32k; proxy_buffers 4 128k;
```

#### 重载nginx配置
``` bash
nginx -s reload
```
<br>
<br>

## 四、负载均衡算法

### 轮询算法
默认的算法，代理服务器将请求轮流发送的服务器池中的服务器

### 权重轮询算法
通过指定服务器池中的服务器权重，请求会优先发送到权重高的服务器上。适用用在多台配置不一的服务器上，将高配置的服务器设为高权重。
``` nginx
upstream web_pool { 
    server 172.16.1.7 weight=1; 
    server 172.16.1.9 weight=2; 
}
```

### ip_hash算法
当新的请求到达时，为客户端IP地址生成哈希值，此后该IP发来的所有请求都会被转发到一台服务器上。
``` nginx
upstream web_pool { 
    ip_hash; 
    server 172.16.1.7; 
    server 172.16.1.9; 
}
```
**注意：**
* ip_hash算法与weight和backup参数存在冲突。
* 移除服务器池中的主机时，不能直接删除记录，而是必须通过down参数来移除服务器；直接删除配置会导致算法发生更改，后续所有的请求都会混乱。

### url_hash算法
为访问url生成哈希值，所有该url的请求都会被转发到同一台服务器上。<br>
Nginx本身不支持url_hash算法，使用此算法需要安装第三方模块ngx_http_upstream_hash_module<br>
``` nginx
upstream web_pool{ 
    hash $request_uri; 
    hash_method crc32; 
    server 172.16.1.7; 
    server 172.16.1.9; 
}
```
<font color=yellow>*注：<br>
其实ip_hash和url_hash几乎很少用到，因为我们配置负载均衡的本意就是为了增强服务的可用性，防止因nginx宕机导致无法提供服务，这两个hash算法将固定的链接或ip都引入到一台nginx主机，如果这台nginx宕机的话这些ip或者链接都不再能够链接到服务，有点本末倒置了。*</font>

### 最小链接数算法
请求将被转发给服务器池中链接数最少的服务器上，使用方法同ip_hash，关键字替换为least_conn；
<br>
<br>

## 五、为多台负载均衡器部署keepalived心跳检测
目前服务器集群中的薄弱点是负载均衡服务器，因为负载均衡服务器只有一台，而且是内网环境中所有主机的流量入口，一旦该主机无法正常提供服务，相当于整个集群都无法工作，因此，将负载均衡器进行集群化也是保证高可用性的重要手段，而keepalived心跳检测则是负载均衡集群的核心服务。<br>

### 什么是keepalived
Keepalived 使用 VRRP 协议来实现高可用性。VRRP 是一种用于路由器故障转移的协议，它允许多个路由器共享同一个虚拟 IP 地址，并且在主路由器故障时自动切换到备用路由器上，从而实现故障转移和负载均衡。

### VRRP协议原理
VRRP 协议通过将多个路由器组合成一个虚拟路由器，实现对外提供高可用性的路由服务。它通过特定的 VRRP 报文进行通信，使用优先级和状态机制确定路由器在虚拟路由器中的地位，实现了路由器故障转移的自动化。

* 虚拟路由器
VRRP 协议可以将多个路由器组合成一个虚拟路由器，这个虚拟路由器有一个虚拟 IP 地址和一个虚拟 MAC 地址，对外提供路由服务。虚拟路由器可以由一台路由器作为主路由器，其他路由器作为备用路由器组成。
* VRRP 报文
VRRP 协议使用特定的 VRRP 报文进行通信，主要包括 Advertisement、Request、Master Down 和 Election 报文。其中，Advertisement 报文是主要的通信报文，主路由器定期向网络发送 Advertisement 报文，广告自己是当前的主路由器，备用路由器则等待 Advertisement 报文，以确定主路由器是否正常工作。
* 优先级
每个路由器都有一个优先级值，用于确定路由器在 VRRP 中的地位，优先级高的路由器会优先成为主路由器。如果主路由器故障，则备用路由器中优先级最高的路由器将自动成为主路由器，并接管虚拟 IP 地址和虚拟 MAC 地址。
* 路由器状态
VRRP 协议中，路由器有三种状态，分别是初始化状态、备用状态和主状态。当路由器启动时，它会进入初始化状态，然后等待主路由器的 Advertisement 报文，确定当前的状态。如果当前是备用状态，路由器会定期发送 Advertisement 报文，以告知网络自己是备用路由器。如果当前是主状态，路由器则会负责转发网络数据包，并定期发送 Advertisement 报文。
* 故障转移
当主路由器出现故障时，备用路由器会自动切换到主路由器的虚拟 IP 地址，并接管虚拟 MAC 地址，从而继续提供对外的路由服务。此时，备用路由器会成为新的主路由器，其他备用路由器则继续保持备用状态。

### 部署keepalived

#### 安装

``` bash
yum install keepalived -y
```

#### 修改配置文件
配置文件路径：/etc/keepalived/keepalived.conf
``` txt
global_defs { 
    router_id lb-5 
} 
vrrp_instance VIP_1 { 
    state MASTER 
    interface eth0 
    virtual_router_id 50 
    priority 150 
    advert_int 1 
    authentication { 
        auth_type PASS 
        auth_pass 1111 
    } 
    virtual_ipaddress { 
        10.0.0.3/24 
    } 
}
```

参数解释：
* router_id lb-5：路由器ID，每个机器都不一样
* vrrp_instance VIP_1：VRRP路由器组组名，同属一个组的名字相同
* state MASTER 角色：分为MASTER和BACKUP两种，即主路由器和备用路由器；MASTER只能有一个，BACKUP可以有多个
* interface eth0 VIP绑定的网卡
* virtual_router_id 50 虚拟路由ID， 同一组的都相同
* priority 150 优先级：优先级高的路由器优先成为主路由器，MASTER的优先级必须高于其他任何一个路由器的优先级
* advert_int 1 advertisement：报文发送间隔
* authentication ：认证形式
* auth_type PASS：密码认证
* auth_pass 1111：指定密码为明文1111 – 在内网环境下，只要有最基本的认证环节就可以
* virtual_ipaddress：指定虚拟IP地址，该IP必须是没被任何机器占用的
<br>

如此一来，当我们的其中一台负载均衡器挂掉后，BACKUP备用服务器组中优先级最高的服务器将自动接管虚拟IP和虚拟MAC，确保仍然能够正常提供服务。

如果想要为wordpress站点提供高可用负载均衡服务，别忘了将域名解析到该虚拟地址；在阿里云上可以直接购买负载均衡服务，阿里云会提供一个服务IP，将域名A记录解析到这个服务IP上就可以了。
