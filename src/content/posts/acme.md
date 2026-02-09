---
title: 使用ACME.SH进行免费且自动化的DV证书续订
published: 2024-01-23
pinned: false
description: ACME，即自动自动证书管理环境(Automatic Certificate Management Environment)，是一个无需人工干预就能自动颁发和更新证书的协议。目前，证书颁发机构Let’s Encrypt通过ACME协议免费提供DV证书。
tags: [SSL]
category: Networks
draft: false
---

# acme.sh是什么
ACME，即自动自动证书管理环境(Automatic Certificate Management Environment)，是一个无需人工干预就能自动颁发和更新证书的协议。目前，证书颁发机构Let’s Encrypt通过ACME协议免费提供DV证书。<br>
[acme.sh](https://github.com/acmesh-official/acme.sh)是一个通过shell脚本实现的自动化ssl证书获取工具。

# 安装acme.sh工具
非常简单，一行代码
``` bash
curl https://get.acme.sh | sh -s email=your@email.com
```
acme.sh会自动被安装在~/.acme.sh/目录下；同时还会生成一个acme.sh的alias：
``` bash
alias acme.sh=~/.acme.sh/acme.sh
```

# 生成证书
acme.sh支持智能读取nginx和apache配置并完成验证。
``` bash
# nginx服务器
acme.sh --issue -d mydomain.com --nginx
# apache服务器
acme.sh --issue -d mydomain.com --apache
```
这种方法会自动在你的网站根目录下生成一个文件来验证域名所有权。

# 安装证书
*需要操作用户是root或者sudoer*<br>
以nginx为例：
``` bash
acme.sh --install-cert -d example.com \
--key-file       /key-file的目标路径/key.pem  \
--fullchain-file /fullchain-file的目标路径/cert.pem \
--reloadcmd     "service nginx force-reload"
```
其中
* --key-file参数是key.pem要被存放的目标路径，一般都是/etc/nginx目录下，这样我们才能在nginx读取到
* --fullchain-file同理
* --reloadcmd参数是在执行完安装后要求nginx进行的重载动作

# 查看已安装的证书信息
acme.sh --info -d 你的域名
``` bash
[root@blog-187 ~]#acme.sh --info -d blog.freelytomorrow.com
[Sun Sep 24 11:01:01 AEST 2023] The domain 'blog.freelytomorrow.com' seems to have a ECC cert already, lets use ecc cert.
DOMAIN_CONF=/root/.acme.sh/blog.freelytomorrow.com_ecc/blog.freelytomorrow.com.conf
Le_Domain=blog.freelytomorrow.com
Le_Alt=no
Le_Webroot=nginx:
Le_PreHook=
Le_PostHook=
Le_RenewHook=
Le_API=https://acme.zerossl.com/v2/DV90
Le_Keylength=ec-256
Le_OrderFinalize=https://acme.zerossl.com/v2/DV90/order/k8qN5WvqYzX8Qij4jrQPPg/finalize
Le_LinkOrder=https://acme.zerossl.com/v2/DV90/order/k8qN5WvqYzX8Qij4jrQPPg
Le_LinkCert=https://acme.zerossl.com/v2/DV90/cert/eNi3DeDNOfAuC8QqbKtI2A
Le_CertCreateTime=1695256995
Le_CertCreateTimeStr=2023-09-21T00:43:15Z
Le_NextRenewTimeStr=2023-11-19T00:43:15Z
Le_NextRenewTime=1700354595
Le_RealCertPath=
Le_RealCACertPath=
Le_RealKeyPath=/etc/nginx/blog.cert/key.pem
Le_ReloadCmd=
Le_RealFullChainPath=/etc/nginx/blog.cert/cert.pem
```

# 配置证书
在nginx的配置文件中
``` nginx
ssl_certificate /etc/nginx/blog.cert/cert.pem;
ssl_certificate_key /etc/nginx/blog.cert/key.pem;
```
这两个参数所指定的路径就是之前安装证书时的那两个参数，也就是--key-file和--fullchain-file的值。

# 更新证书
acme.sh会自动给你的服务器上生成定时任务，会在一段时间后自动更新，所以无需手动操作。<br>
只需要让你的定时任务看起来像这样：
``` bash
[root@blog-187 ~]#crontab -l
27 0 * * * "/root/.acme.sh"/acme.sh --cron --home "/root/.acme.sh" > /dev/null
```

# 停止证书续订
``` bash
acme.sh --remove -d example.com
```
证书和秘钥不会被删除，需要你手动删除。
# 更新acme.sh
更新到最新版
``` bash
acme.sh --upgrade
```

自动更新
``` bash
acme.sh --upgrade --auto-upgrade
```

关闭自动更新
``` bash
acme.sh --upgrade --auto-upgrade  0
```

详细教程：https://github.com/acmesh-official/acme.sh
