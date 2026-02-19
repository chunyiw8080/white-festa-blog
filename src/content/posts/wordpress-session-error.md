---
title: 解决WordPress读取会话数据失败报错
published: 2022-06-11
pinned: false
tags: [WordPress]
category: CMS
draft: false
---

## 报错信息
``
[error] 5378#5378: *2481 FastCGI sent in stderr: “PHP message: PHP Warning: session_start(): open(/var/lib/php/session/sess_11d6edde5218ffa04f1fc6f231efe25d, O_RDWR) failed: No such file or directory (2) in /code/wordpress/wp-content/themes/argon-theme-1.3.5/functions.php on line 432
``

## 原因
缺少 PHP 会话目录、具有无效权限和/或无效的 SELinux

## 解决方法
1. 打开/etc/php.ini文件，查看session.save_path的值<br>

2. 该值通常是被注释掉的，也就是未设置的状态；在基于 Ubuntu 或 Debian 操作系统的系统上，此变量的默认值为：/var/lib/php7 ； 在基于 RHEL 或 CentOS 操作系统上，默认值为：/var/lib/php/session；如果该变量被设置了特定值，则用该值替换路径。<br>

3. 创建和/或设置对 PHP 会话文件夹的适当权限。例如，我的CentOS服务器的PHP会话目录路径是：/var/lib/php/session<br>

4. 可输入以下指令：<br>

``` bash
mkdir -p /var/lib/php/session && chmod 1733 /var/lib/php/session
```
