---
title: HAProxy - 性能更好的负载均衡器
published: 2026-03-28
pinned: true
description: hello
tags: [HAProxy]
category: Linux软件部署及使用
draft: false
---

# 一、HAProxy简介
HAProxy是一个用C语言编写的专精于反向代理和负载均衡的应用，基于HAProxy，可以实现L4、L7级反向代理。

## 1. L7转发
在纯代理转发场景下，HAProxy的L7性能略优，因为它没有文件服务、缓存等额外模块的开销，代码路径更短。

|-|HAProxy|Nginx|
|:--:|:--:|:--:|
|纯 HTTP 转发吞吐|略高（更少内存拷贝）|接近，差距 <10%|
|静态内容 / 缓存 | 不支持 | 原生支持|
|SSL/TLS终止| 优秀| 优秀（略占优，有更多调优选项）|
|HTTP/2 后端转发|支持（较新版本）|支持（更成熟）|
|WebSocket| 支持| 支持|
|内存占用| 更低 | 稍高 |
| 健康检查精细度| 明显更精确 | 一般 |

## 2. L4转发
而在相同硬件下，HAProxy L4的吞吐量和CPS（每秒新建连接数）明显比Nginx更高，并且有着连接处理开销更小（几乎是纯粹的包转发）的优势；尤其是在内存模型上，HAProxy在TCP模式下使用`无缓冲直连`模型 [src/mux_pt.c](https://github.com/haproxy/haproxy/blob/master/src/mux_pt.c)
```text
Client fd → pipe → Backend fd
```
数据在内核空间完成转发，HAProxy进程本身几乎不接触payload。


Nginx的stream模块虽然也支持TCP，但它沿用了HTTP模块的buffer机制，数据会先读入用户空间的ngx_buf_t，再写出去，多了一次内存拷贝，这也是为什么HAProxy在L4转发上有明显的性能优势，而到了L7这种优势又突然变小，因为要想做HTTP代理，必须解析HTTP协议才能做路由决策，这意味着：
- 必须把数据读入用户空间
- 必须解析HTTP报文
- 必须维护两条TCP连接: client to proxy，proxy to backend

# 二、HAProxy配置文件
## 1. 全局配置
全局配置使用 `global` 关键字定义，例如：
### 1.1 进程与线程
```text
global
    chroot      /var/lib/haproxy
    pidfile     /var/run/haproxy.pid
    user        haproxy
    group       haproxy
    daemon

    nbthread 4
    cpu-map auto:1/1-4 0-3 # 线程绑定到指定 CPU 核心
    ulimit-n 65536 # 最大文件描述符数
```
### 1.2 日志
```text
global
    # 通用日志配置
    log         127.0.0.1 local2
    # 日志目标、facility、级别
    log 127.0.0.1 local0 info
    log 127.0.0.1 local1 warning

    log-send-hostname # 日志中包含主机名
    log-tag haproxy # 日志标签
```
### 1.3 性能调优
```text
global
    maxconn 50000                   # 全局最大并发连接数
    maxpipes 200                    # splice() 最大管道数
    spread-checks 5                 # 健康检查时间分散比例（%），避免同时检查
    tune.bufsize 16384              # 读写缓冲区大小，默认 16KB
    tune.maxrewrite 1024            # 请求重写缓冲区
    tune.rcvbuf.client 0            # 客户端 socket 接收缓冲
    tune.sndbuf.client 0            # 客户端 socket 发送缓冲
    tune.rcvbuf.server 0            # 服务端 socket 接收缓冲
    tune.sndbuf.server 0            # 服务端 socket 发送缓冲
    tune.maxaccept 100              # 每次事件循环最多 accept 的连接数
    tune.comp.maxlevel 1            # 压缩级别上限
```
### 1.4 SSL/TLS
```text
global
    tune.ssl.default-dh-param 2048         # DH 参数强度，建议 2048 以上
    tune.ssl.maxrecord 1400                # SSL 记录最大长度，调小可降低延迟
    tune.ssl.cachesize 20000               # SSL session 缓存大小
    tune.ssl.lifetime 300                  # SSL session 缓存有效期（秒）
    ssl-default-bind-ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256
    ssl-default-bind-options ssl-min-ver TLSv1.2 no-tls-tickets
    ssl-default-server-ciphers ECDHE-ECDSA-AES128-GCM-SHA256
    ssl-default-server-options ssl-min-ver TLSv1.2
```