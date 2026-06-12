---
title: WordPress修改上传媒体文件大小限制
published: 2022-05-20
pinned: false
tags: [WordPress, Nginx]
category: CMS
draft: false
---

需要从两个方面入手，一个是wordpress本身，也就是它的php配置文件，另一个是修改nginx虚拟主机的限制。

## 修改php.ini配置文件

打开/etc/php.ini文件，如果不在/etc目录下可以用find命令查找一下
``` bash
find / -name 'php.ini'
```

找到后打开文件，找到upload_max_filesize字段，将其后面的值修改为32或64M；<br>
不建议更大，因为特别大的文件播放或读取起来对带宽的要求很高。

## 修改nginx.conf文件
在/etc/nginx/nginx.conf文件中，找到http区块，在其中增加一行：

``` nginx
client_max_body_size 64m;
```

接下来重启服务即可
``` bash
systemctl restart php-fpm && systemctl reload nginx
```
