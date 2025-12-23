---
title: 一个查看域名ssl认证有效期的脚本
published: 2023-08-14
pinned: false
description: 一个查看域名ssl认证有效期的shell脚本
tags: [SSL, Shell]
category: 运维自动化
draft: false
---

``` bash
server_name=$1

# 获取网站的证书有效期
ssl_time=$(echo | openssl s_client -servername ${server_name}  -connect ${server_name}:443 2>/dev/null | openssl x509 -noout -dates|awk -F '=' '/notAfter/{print $2}')

# 转换时间戳
ssl_unix_time=$(date +%s -d "${ssl_time}")

# 获取今天时间戳
today=$(date +%s)

# 计算剩余时间

let  expr_time=($ssl_unix_time-$today)/24/3600

echo "${server_name} : SSL Certification Expired in $expr_time days. "

```

### 使用
``` bash
[root@wordpress-187 ~]#./ssl_expire.sh blog.freelytomorrow.com
blog.freelytomorrow.com : SSL Certification Expired in 247 days.
```

