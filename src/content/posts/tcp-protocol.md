---
title: TCP协议简述
published: 2023-04-13
pinned: false
description: 关于TCP三次握手和四次挥手的简单描述
tags: [TCP]
category: Networks
draft: false
---

## TCP三次握手
TCP是**面向字节流**的可靠的数据传输协议，采用三次握手机制建立一个点对点的链接。

### 三次握手的流程
* 第一次握手：Client将标志位SYN置为1，随机产生一个值seq=J，并将该数据包发送给Server，Client进入SYN_SENT状态，等待Server确认。
* 第二次握手：Server收到数据包后由标志位SYN=1知道Client请求建立连接，Server将标志位SYN和ACK都置为1，ack=J+1，随机产生一个值seq=K，并将该数据包发送给Client以确认连接请求，Server进入SYN_RCVD状态。
* 第三次握手：Client收到确认后，检查ack是否为J+1，ACK是否为1，如果正确则将标志位ACK置为1，ack=K+1，并将该数据包发送给Server，Server检查ack是否为K+1，ACK是否为1，如果正确则连接建立成功，Client和Server进入ESTABLISHED状态，完成三次握手，随后Client与Server之间可以开始传输数据了。
![三次握手](https://blog.freelytomorrow.com/articles_img/tcp-protocol/3handshake1.png)<br>

### TCP报文和标志位含义

TCP报文：
![tcp报文](https://blog.freelytomorrow.com/articles_img/tcp-protocol/tcp-header.png)<br>
#### seq序号
占32位。在一个TCP连接中传送的字节流中的每一个字节都按顺序编号。整个要传送的字节流的起始序号必须在连接建立时设置。首部中的序号字段值则是指的是本报文段所发送的数据的第一个字节的序号。长度为4字节，序号是32bit的无符号数,序号到达 *2的32次方-1* 后又从0开始。
### #Ack确认号
占32位，当ACK标志位为1时，该Ack值有效；Ack=seq+1，也就是说Ack号是发送确认的一端所期望收到的下一个序号。
* 发送确认端：发出确认信号的一端，比如在TCP三次握手中，第二轮握手的Server端就是发送确认端，而第三轮握手中的Client也是发送确认端。
#### 数据偏移
也叫首部长度，占4个bit,它指出TCP报文段的数据起始处距离TCP报文段的起始处有多远。
#### 保留位
占6位，保留为今后使用，不使用时应置为0。
#### 标志位
共6个，即URG、ACK、PSH、RST、SYN、FIN

#### URG
紧急指针（urgent pointer），当URG=1时，表明紧急指针字段有效。它告诉系统此报文段中有紧急数据，应尽快发送（相当于高优先级的数据），而不要按原来的排队顺序来传送
#### ACK
仅当ACK = 1时确认号字段才有效，当ACK = 0时确认号无效。TCP规定，在连接建立后所有的传送的报文段都必须把ACK置为1。
#### PSH
当两个应用进程进行交互式的通信时，有时在一端的应用进程希望在键入一个命令后立即就能收到对方的响应。在这种情况下，TCP就可以使用推送（push）操作。发送方TCP把PSH置为1，并立即创建一个报文段发送出去。接收方TCP收到PSH=1的报文段，就尽快地向前交付接收应用进程。而不用再等到整个缓存都填满了后再向上交付。
#### RST
重置连接。当RST=1时，表明TCP连接中出现了严重错误（如由于主机崩溃或其他原因），必须释放连接，然后再重新建立传输连接。RST置为1还用来拒绝一个非法的报文段或拒绝打开一个连接。
#### SYN
在连接建立时用来同步序号。当SYN=1而ACK=0时，表明这是一个连接请求报文段。对方若同意建立连接，则应在响应的报文段中使SYN=1和ACK=1。
因此SYN=1就表示这是一个连接请求或连接接受报文。
#### FIN
释放(终止)一个连接。当FIN=1时，表明此报文段的发送发的数据已发送完毕，并要求释放运输连接。

### 为什么TCP三次握手是三次而不是两次或更多次？
三次握手本质上是为了确保TCP链接可靠性进行的确认动作，收发双方通过三次握手确认了自己和对方的收发能力都正常之后，才会建立链接。

以一个客户端与服务端建立链接为例：
![确认收发](https://blog.freelytomorrow.com/articles_img/tcp-protocol/3handshake2.png)
在三次握手建立链接的过程中，服务端和客户端都通过数据包的收发确认了自己和对方的收发能力正常，因此才建立了链接。

## TCP四次挥手
TCP四次挥手即客户端与服务端在终止链接前进行的一系列操作，其本质是为了确认双方都正常发送和接收到了预期内容，不会因为链接突然终止导致数据丢失。

由于TCP连接时全双工的，因此，每个方向都必须要单独进行关闭，这一原则是当一方完成数据发送任务后，发送一个FIN来终止这一方向的连接，收到一个FIN只是意味着这一方向上没有数据流动了，即不会再收到数据了，但是在这个TCP连接上仍然能够发送数据，直到令一方向也发送了FIN。首先进行关闭的一方将执行主动关闭，而另一方则执行被动关闭

### 四次挥手流程
* 第一次挥手：Client发送一个FIN，用来关闭Client到Server的数据传送，Client进入FIN_WAIT_1状态。
* 第二次挥手：Server收到FIN后，发送一个ACK给Client，确认序号为收到序号+1（与SYN相同，一个FIN占用一个序号），Server进入CLOSE_WAIT状态。
* 第三次挥手：Server发送一个FIN，用来关闭Server到Client的数据传送，Server进入LAST_ACK状态。
* 第四次挥手：Client收到FIN后，Client进入TIME_WAIT状态，接着发送一个ACK给Server，确认序号为收到序号+1，Server进入CLOSED状态，完成四次挥手。
![四次挥手](https://blog.freelytomorrow.com/articles_img/tcp-protocol/4wavehands.png)

### TIME-WAIT 状态为什么需要等待 2MSL
1. 1个 MSL 保证四次挥手中主动关闭方最后的 ACK 报文能最终到达对端
2. 1个 MSL 保证对端没有收到 ACK 那么进行重传的 FIN 报文能够到达

### 为什么建立连接是三次握手，而关闭连接却是四次挥手?
这是因为服务端在LISTEN状态下，收到建立连接请求的SYN报文后，把ACK和SYN放在一个报文里发送给客户端。而关闭连接时，当收到对方的FIN报文时，仅仅表示对方不再发送数据了但是还能接收数据，己方也未必全部数据都发送给对方了，所以己方可以立即close，也可以发送一些数据给对方后，再发送FIN报文给对方来表示同意现在关闭连接，因此，己方ACK和FIN一般都会分开发送。
