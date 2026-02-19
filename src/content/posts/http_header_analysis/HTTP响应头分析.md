---
title: 以真实世界的网络故障为例，分析如何通过HTTP response header定位故障域
published: 2025-11-18
pinned: false
description: 本文以澳洲头部零售网站 JB-HIFI 的真实宕机事件为样本，深度解析其 HTTP 响应头。你将看到，无需内部日志，仅凭客户端可见信息，即可完成从边缘到源站的全链路故障域推断。
tags: [HTTP, CloudFlare, CDN, 网络故障]
category: DevOps
draft: false
---

# 案例一、正确的响应头 - JBHIFI
```http
* Host www.jbhifi.com.au:443 was resolved. 
# 成功解析域名到443端口
* IPv6: (none)
* IPv4: 172.67.154.62, 104.21.4.235
# 源站不提供IPv6地址，但提供两个IPv4地址
*   Trying 172.67.154.62:443...
# 尝试连接第一个IP地址
* ALPN: curl offers h2,http/1.1 (ALPN: Application Layer Protocol Negotiation - 应用层协议协商)
# 客户端：curl命令提供它所支持的两种HTTP协议
* TLSv1.3 (OUT), TLS handshake, Client hello (1):
# 客户端发送握手信息
*  CAfile: /etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem
*  CApath: none
# 用于验证服务端证书的本地证书路径
* TLSv1.3 (IN), TLS handshake, Server hello (2):
# 服务端发送握手信息
* TLSv1.3 (IN), TLS handshake, Encrypted Extensions (8):
# 在Client hello (1)和Server hello (2)之后，HTTP加密信道建立完成，之后所有的内容都是通过该信道传输的
# Encrypted Extensions将在握手初期无法加密、但又不应该继续明文暴露的扩展信息放到加密通道里发送，比如协议协商结果、支持的签名算法等各种参数
* TLSv1.3 (IN), TLS handshake, Certificate (11):
# 服务器的数字证书链
* TLSv1.3 (IN), TLS handshake, CERT verify (15):
# 服务器的数字签名。
* TLSv1.3 (IN), TLS handshake, Finished (20):
# 客户端最后一次握手
* TLSv1.3 (OUT), TLS change cipher, Change cipher spec (1):
# 在TLS 1.2中：双方下一条消息开始将使用刚刚协商好的密钥与加密算法；在TLS1.3中：TLS 1.3 完全不再使用 CCS 来切换加密。握手过程是“自动”进入加密状态的。CCS 在 TLS 1.3 中变成了几乎“无意义的兼容占位符”（为了兼容旧的中间设备）。
* TLSv1.3 (OUT), TLS handshake, Finished (20):
# 服务端最后一次握手
# 在1.3中，双方在结束握手后仍可以发送握手相关但不属于握手阶段的消息，比如NewSessionTicket；但是在1.2中，TLS handshake, Finished意味着握手正式结束
* SSL connection using TLSv1.3 / TLS_AES_256_GCM_SHA384 / x25519 / id-ecPublicKey
* ALPN: server accepted h2
# 应用层协议协商结果：使用HTTP/2协议
* Server certificate:
*  subject: CN=www.jbhifi.com.au
*  start date: Nov 21 02:14:02 2025 GMT
*  expire date: Feb 19 03:14:00 2026 GMT
*  subjectAltName: host "www.jbhifi.com.au" matched cert's "www.jbhifi.com.au"
*  issuer: C=US; O=Google Trust Services; CN=WE1
*  SSL certificate verify ok.
# 服务端证书验证结果
*   Certificate level 0: Public key type EC/prime256v1 (256/128 Bits/secBits), signed using ecdsa-with-SHA256
*   Certificate level 1: Public key type EC/prime256v1 (256/128 Bits/secBits), signed using ecdsa-with-SHA384
*   Certificate level 2: Public key type EC/secp384r1 (384/192 Bits/secBits), signed using ecdsa-with-SHA384
# 证书链层级 - Level 2：根证书
* Connected to www.jbhifi.com.au (172.67.154.62) port 443
* using HTTP/2
* [HTTP/2] [1] OPENED stream for https://www.jbhifi.com.au/
* [HTTP/2] [1] [:method: HEAD]
* [HTTP/2] [1] [:scheme: https]
* [HTTP/2] [1] [:authority: www.jbhifi.com.au]
* [HTTP/2] [1] [:path: /]
* [HTTP/2] [1] [user-agent: curl/8.11.1]
* [HTTP/2] [1] [accept: */*]
> HEAD / HTTP/2
> Host: www.jbhifi.com.au
> User-Agent: curl/8.11.1
> Accept: */*
>
* Request completely sent off
* TLSv1.3 (IN), TLS handshake, Newsession Ticket (4):
* TLSv1.3 (IN), TLS handshake, Newsession Ticket (4):
< HTTP/2 103
HTTP/2 103
< link: <https://cdn.shopify.com>; rel=preconnect, <https://cdn.shopify.com>; crossorigin; rel=preconnect
link: <https://cdn.shopify.com>; rel=preconnect, <https://cdn.shopify.com>; crossorigin; rel=preconnect
<
# 第一个响应部分：返回上游源站地址以及103状态码，告知客户端可以在等待期间预连接和预解析上游源站的内容（这个部分其实是由边缘节点通过旧缓存得到的）
< HTTP/2 200
HTTP/2 200
< date: Sun, 23 Nov 2025 00:40:47 GMT
date: Sun, 23 Nov 2025 00:40:47 GMT
< content-type: text/html; charset=utf-8
content-type: text/html; charset=utf-8
< x-download-options: noopen
x-download-options: noopen
< x-content-type-options: nosniff
x-content-type-options: nosniff
< server: cloudflare
server: cloudflare
# 网站使用了Cloudflare的服务，请求实际上先到达了Cloudflare的边缘服务器，而不是直接访问源站
< x-sorting-hat-podid: 200
x-sorting-hat-podid: 200
< x-sorting-hat-shopid: 2498035810
x-sorting-hat-shopid: 2498035810
< x-storefront-renderer-rendered: 1
x-storefront-renderer-rendered: 1
< nel: {"success_fraction":0.01,"report_to":"cf-nel","max_age":604800}
nel: {"success_fraction":0.01,"report_to":"cf-nel","max_age":604800}
< x-xss-protection: 1; mode=block
x-xss-protection: 1; mode=block
< link: <https://cdn.shopify.com>; rel="preconnect", <https://cdn.shopify.com>; rel="preconnect"; crossorigin
link: <https://cdn.shopify.com>; rel="preconnect", <https://cdn.shopify.com>; rel="preconnect"; crossorigin
< speculation-rules: "/cdn/shopifycloud/storefront/assets/storefront/storefronts.specrules-dd5621a1.json"
speculation-rules: "/cdn/shopifycloud/storefront/assets/storefront/storefronts.specrules-dd5621a1.json"
< x-permitted-cross-domain-policies: none
x-permitted-cross-domain-policies: none
< shopify-complexity-score: 630
shopify-complexity-score: 630
< x-frame-options: DENY
x-frame-options: DENY
< content-security-policy: block-all-mixed-content; frame-ancestors 'none'; upgrade-insecure-requests;
content-security-policy: block-all-mixed-content; frame-ancestors 'none'; upgrade-insecure-requests;
< strict-transport-security: max-age=7889238
strict-transport-security: max-age=7889238
# HTTP Strict Transport Security - 要求浏览器在接下来的 7889238秒（约91天）内，所有访问都必须通过 HTTPS 进行，即使用户手动输入HTTP前缀也不行
< x-shopid: 2498035810
x-shopid: 2498035810
< x-shardid: 200
x-shardid: 200
< vary: Accept
vary: Accept
< alt-svc: clear
alt-svc: clear
< content-language: en-AU
content-language: en-AU
< powered-by: Shopify
powered-by: Shopify
< server-timing: processing;dur=65;desc="gc:3", db;dur=5, asn;desc="38195", edge;desc="MEL", country;desc="AU", theme;desc="124174237897", pageType;desc="index", servedBy;desc="qtf2", requestID;desc="0426ca1a-3037-49c5-bd6b-23316b9fc060-1763858447", _y;desc="1fb99192-c832-461e-9fb1-a65ef63a3bb4", _s;desc="931f14bd-2507-4174-9e36-76965059cf8f", _cmp;desc="3.AMPS_AUVIC_f_f_Mmy0NNj2SP6hgsc2JxNRjw"
server-timing: processing;dur=65;desc="gc:3", db;dur=5, asn;desc="38195", edge;desc="MEL", country;desc="AU", theme;desc="124174237897", pageType;desc="index", servedBy;desc="qtf2", requestID;desc="0426ca1a-3037-49c5-bd6b-23316b9fc060-1763858447", _y;desc="1fb99192-c832-461e-9fb1-a65ef63a3bb4", _s;desc="931f14bd-2507-4174-9e36-76965059cf8f", _cmp;desc="3.AMPS_AUVIC_f_f_Mmy0NNj2SP6hgsc2JxNRjw"
< server-timing: cfRequestDuration;dur=101.000071
server-timing: cfRequestDuration;dur=101.000071
< x-dc: gcp-australia-southeast2,gcp-australia-southeast2,gcp-australia-southeast2
x-dc: gcp-australia-southeast2,gcp-australia-southeast2,gcp-australia-southeast2
< x-request-id: 0426ca1a-3037-49c5-bd6b-23316b9fc060-1763858447
x-request-id: 0426ca1a-3037-49c5-bd6b-23316b9fc060-1763858447
< cf-cache-status: DYNAMIC
cf-cache-status: DYNAMIC
# Cloudflare 缓存状态为动态，表示该请求的结果是动态生成的，未从缓存中提供
< report-to: {"endpoints":[{"url":"https:\/\/a.nel.cloudflare.com\/report\/v4?s=RuvC51YPALi2HsPfxUleVK35sf1HdlPV8Z8ZOEQ%2Fjcg%2FBGqX2zI5OMci1%2FZH8QXT0eaAhoH4Fn7AmVdG4LcI7trQFW3qlz70oPREXfNmOa8T8bszd08EHsVlwBdzYRrHQ%2FWB"}],"group":"cf-nel","max_age":604800}
report-to: {"endpoints":[{"url":"https:\/\/a.nel.cloudflare.com\/report\/v4?s=RuvC51YPALi2HsPfxUleVK35sf1HdlPV8Z8ZOEQ%2Fjcg%2FBGqX2zI5OMci1%2FZH8QXT0eaAhoH4Fn7AmVdG4LcI7trQFW3qlz70oPREXfNmOa8T8bszd08EHsVlwBdzYRrHQ%2FWB"}],"group":"cf-nel","max_age":604800}
< set-cookie: localization=AU; Path=/; Expires=Mon, 23 Nov 2026 00:40:47 GMT
set-cookie: localization=AU; Path=/; Expires=Mon, 23 Nov 2026 00:40:47 GMT
< set-cookie: cart_currency=AUD; Path=/; Expires=Sun, 07 Dec 2025 00:40:47 GMT
set-cookie: cart_currency=AUD; Path=/; Expires=Sun, 07 Dec 2025 00:40:47 GMT
< set-cookie: _shopify_y=1fb99192-c832-461e-9fb1-a65ef63a3bb4; SameSite=Lax; Path=/; Domain=jbhifi.com.au; Expires=Mon, 23 Nov 2026 06:40:47 GMT
set-cookie: _shopify_y=1fb99192-c832-461e-9fb1-a65ef63a3bb4; SameSite=Lax; Path=/; Domain=jbhifi.com.au; Expires=Mon, 23 Nov 2026 06:40:47 GMT
< set-cookie: _shopify_s=931f14bd-2507-4174-9e36-76965059cf8f; SameSite=Lax; Path=/; Domain=jbhifi.com.au; Expires=Sun, 23 Nov 2025 01:10:47 GMT
set-cookie: _shopify_s=931f14bd-2507-4174-9e36-76965059cf8f; SameSite=Lax; Path=/; Domain=jbhifi.com.au; Expires=Sun, 23 Nov 2025 01:10:47 GMT
< set-cookie: _shopify_essential=:AZquJ_2WAAEASOX7TWlJmhIlWC5WHepgd8oe9O9cEZHJDsW8A8FlFz76zLBcZsOjHPJIdRPpu5yLJSy_pk7TfkwIyHza4C0qVkpZhyNvAA7TPSeZ5ZivS1mHrOUfvrkGhJ8ncIn27iWgJ0ei8hxpS1btPNrM-TpPZzAOmX_wb6FqLNg5h7zfJ5yjSoRI9BYkCezAlEyISjrMQlOK7wizLn0V3f1_30QjshEJyCwNdLxgrF0Eus35l3HV7HG8XETTKRMDyWTBsE3l4He59zkPTuMQsYpvrMX6EBfYf4fJKFh6le5Tz8Y:; HttpOnly; SameSite=Lax; Secure; Path=/; Max-Age=31536000
set-cookie: _shopify_essential=:AZquJ_2WAAEASOX7TWlJmhIlWC5WHepgd8oe9O9cEZHJDsW8A8FlFz76zLBcZsOjHPJIdRPpu5yLJSy_pk7TfkwIyHza4C0qVkpZhyNvAA7TPSeZ5ZivS1mHrOUfvrkGhJ8ncIn27iWgJ0ei8hxpS1btPNrM-TpPZzAOmX_wb6FqLNg5h7zfJ5yjSoRI9BYkCezAlEyISjrMQlOK7wizLn0V3f1_30QjshEJyCwNdLxgrF0Eus35l3HV7HG8XETTKRMDyWTBsE3l4He59zkPTuMQsYpvrMX6EBfYf4fJKFh6le5Tz8Y:; HttpOnly; SameSite=Lax; Secure; Path=/; Max-Age=31536000
< set-cookie: _shopify_analytics=:AZquJ_2oAAEAM9UbkBnz7Nr_acH-aKE9s0vD_DsFDSBVd3An_Bod0m3sITODbuwcfqy7WQ:; HttpOnly; SameSite=Lax; Secure; Path=/; Max-Age=31536000
set-cookie: _shopify_analytics=:AZquJ_2oAAEAM9UbkBnz7Nr_acH-aKE9s0vD_DsFDSBVd3An_Bod0m3sITODbuwcfqy7WQ:; HttpOnly; SameSite=Lax; Secure; Path=/; Max-Age=31536000
# 服务器设置了多个 Cookie，用于跟踪用户会话、本地化设置等等
< cf-ray: 9a2c9e021852189f-MEL
cf-ray: 9a2c9e021852189f-MEL
# 使用了CloudFlare在墨尔本地区的边缘计算节点
<
# 响应的第二部分：从目标站点请求的内容
* Connection #0 to host www.jbhifi.com.au left intact
```

# 案例二、 服务故障响应头
```http
* Host www.jbhifi.com.au:443 was resolved.
* IPv6: (none)
* IPv4: 104.21.4.235, 172.67.154.62
*   Trying 104.21.4.235:443...
* ALPN: curl offers h2,http/1.1
* TLSv1.3 (OUT), TLS handshake, Client hello (1):
*  CAfile: /etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem
*  CApath: none
* TLSv1.3 (IN), TLS handshake, Server hello (2):
* TLSv1.3 (IN), TLS handshake, Encrypted Extensions (8):
* TLSv1.3 (IN), TLS handshake, Certificate (11):
* TLSv1.3 (IN), TLS handshake, CERT verify (15):
* TLSv1.3 (IN), TLS handshake, Finished (20):
* TLSv1.3 (OUT), TLS change cipher, Change cipher spec (1):
* TLSv1.3 (OUT), TLS handshake, Finished (20):
* SSL connection using TLSv1.3 / TLS_AES_256_GCM_SHA384 / x25519 / id-ecPublicKey
* ALPN: server accepted h2
* Server certificate:
*  subject: CN=www.jbhifi.com.au
*  start date: Sep 23 01:33:52 2025 GMT
*  expire date: Dec 22 02:33:51 2025 GMT
*  subjectAltName: host "www.jbhifi.com.au" matched cert's "www.jbhifi.com.au"
*  issuer: C=US; O=Google Trust Services; CN=WE1
*  SSL certificate verify ok.
*   Certificate level 0: Public key type EC/prime256v1 (256/128 Bits/secBits), signed using ecdsa-with-SHA256
*   Certificate level 1: Public key type EC/prime256v1 (256/128 Bits/secBits), signed using ecdsa-with-SHA384
*   Certificate level 2: Public key type EC/secp384r1 (384/192 Bits/secBits), signed using ecdsa-with-SHA384
* Connected to www.jbhifi.com.au (104.21.4.235) port 443
* using HTTP/2
* [HTTP/2] [1] OPENED stream for https://www.jbhifi.com.au/
* [HTTP/2] [1] [:method: HEAD]
* [HTTP/2] [1] [:scheme: https]
* [HTTP/2] [1] [:authority: www.jbhifi.com.au]
* [HTTP/2] [1] [:path: /]
* [HTTP/2] [1] [user-agent: curl/8.11.1]
* [HTTP/2] [1] [accept: */*]
> HEAD / HTTP/2
> Host: www.jbhifi.com.au
> User-Agent: curl/8.11.1
> Accept: */*
> 
* Request completely sent off
* TLSv1.3 (IN), TLS handshake, Newsession Ticket (4):
* TLSv1.3 (IN), TLS handshake, Newsession Ticket (4):
< HTTP/2 103 
HTTP/2 103 
< link: <https://cdn.shopify.com>; rel=preconnect, <https://cdn.shopify.com>; crossorigin; rel=preconnect
link: <https://cdn.shopify.com>; rel=preconnect, <https://cdn.shopify.com>; crossorigin; rel=preconnect
< 
< HTTP/2 500 
HTTP/2 500 
< date: Tue, 18 Nov 2025 12:40:50 GMT
date: Tue, 18 Nov 2025 12:40:50 GMT
< content-type: text/plain; charset=UTF-8
content-type: text/plain; charset=UTF-8
< content-length: 15
content-length: 15
< cache-control: private, max-age=0, no-store, no-cache, must-revalidate, post-check=0, pre-check=0
cache-control: private, max-age=0, no-store, no-cache, must-revalidate, post-check=0, pre-check=0
< expires: Thu, 01 Jan 1970 00:00:01 GMT
expires: Thu, 01 Jan 1970 00:00:01 GMT
< referrer-policy: same-origin
referrer-policy: same-origin
< x-frame-options: SAMEORIGIN
x-frame-options: SAMEORIGIN
< server: cloudflare
server: cloudflare
< cf-ray: 9a0789e2bf519878-MEL
cf-ray: 9a0789e2bf519878-MEL
< 

* Connection #0 to host www.jbhifi.com.au left intact

```

故障点分析：

+ 已知 www.jbhifi.com.au 使用了 CloudFlare 的边缘节点，同时使用了 103 预连接技术
+ 边缘节点从旧的缓存层中解析到了 preconnect/early hints
+ 在等待源站内容返回时，边缘节点向`https://cdn.shopify.com`发起请求，请求静态资源文件
+ 但最后，对www.jbhifi.com.au 的内容请求失败，因此返回了 500 状态码
+ 103 不返回任何源站状态信息，因此无法知道请求是否成功
+ 状态码 500，但服务器签名是cloudflare，这意味着错误来源是 CloudFlare 中间代理层；如果是 JBHIFI 源站故障，状态码应该是以下几种
    - 500 - 但是服务器签名不是CloudFlare，而是`server: nginx` / `apache` / `shopify` 等  
    - 522  - 服务完全挂掉，错误响应都无法返回，最终由 CloudFlare 报告连接超时：`server: cloudflare`  
    -  521 - 源站拒绝连接：`server: cloudflare`
    - 404/403 - 源站资源不存在/无权限访问：`server: nginx` / `apache` / `shopify` 等  

总结：

因为 JBHIFI 接入了 Cloudflare，请求会先到边缘节点，边缘节点从缓存或部分解析出的内容里提前发出 preconnect/early hints，但最终结果仍取决于它向 JBHIFI 源站取内容是否成功，所以即使静态资源能从 CDN 获取成功，只要源站取源失败，整次请求就必然失败。  

