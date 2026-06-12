---
title: Zabbix安装和自定义监控项
published: 2023-09-07
pinned: false
tags: [Zabbix]
category: Linux软件部署及使用
draft: false
---

## 安装Zabbix服务端
Zabbix服务端分为两个部分：提供前端交互的Web服务端和存储数据的MySQL数据库
### 设置Zabbix数据库
这里直接使用docker的MySQL镜像，使用下面的docker-compose：
``` yaml
version: "3"
services:
   db:
     image: mysql:5.7
     command:
      - --default_authentication_plugin=mysql_native_password
      - --character-set-server=utf8
      - --collation-server=utf8_unicode_ci
     volumes:
       - db_data:/var/lib/mysql
     restart: always
     environment:
       MYSQL_ROOT_PASSWORD: 密码
       MYSQL_DATABASE: zabbix
       MYSQL_PASSWORD: 密码

volumes: 
  db_data:
```
启动：
```
docker-compose -f docker-compose.yml up -d
```
此时Zabbix数据库已经建好了，但还只是个空壳，具体的库表还需要再安装好Zabbix后导入。
### 安装Zabbix-server
#### 配置yum源
这里用的是清华源：
``` bash
rpm -ivh https://mirrors.tuna.tsinghua.edu.cn/zabbix/zabbix/4.0/rhel/8/x86_64/zabbix-release-4.0-2.el8.noarch.rpm
```
修改repo文件，改为清华源
``` bash
sed -i 's#repo.zabbix.com#mirrors.tuna.tsinghua.edu.cn/zabbix#g' /etc/yum.repos.d/zabbix.repo
```
#### 安装Zabbix和其他组件
``` bash
yum install -y zabbix-server-mysql zabbix-web-mysql zabbix-agent php-fpm
```
#### 导入Zabbix数据库库表，创建Zabbix用户
``` bash
zcat /usr/share/doc/zabbix-server-mysql/create.sql.gz | mysql -h172.18.0.2 -uroot -p密码 zabbix
```
创建zabbix用户并授权
``` sql
grant all privileges on zabbix.* to zabbix@localhost identified by 'password';
```
#### 修改zabbix-server配置文件
配置文件：``/etc/zabbix/zabbix_server.conf``。
主要是修改数据库部分
```
DBHost=localhost
DBName=zabbix
DBUser=zabbix
DBPassword=密码
```
最后启动服务

## 配置Nginx代理Zabbix前端
``` nginx
server {
    listen       80;
    listen       [::]:80;
    server_name  _;
    root /usr/share/zabbix/;
    index index.php index.html;
    # Load configuration files for the default server block.
    include /etc/nginx/default.d/*.conf;
	
	location / {
		try_files $uri $uri/ /index.php?$args;
	}

	location ~ [^/]\.php(/|$) {
		fastcgi_buffer_size 128k;
		fastcgi_buffers 32 32k; 
		fastcgi_pass 127.0.0.1:9000;
		fastcgi_index index.php;
		fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
		include fastcgi_params;
		include fastcgi.conf;
	}
}
```
因为zabbix的前端是用php写的，所以这时候就用到了php-fpm用来处理动态请求。
重启Nginx后访问IP:port/zabbix/setup.php即可进入zabbix安装界面。

## 安装配置zabbix前端
安装zabbix前端主要就是检查php的一些变量和配置和数据库的链接。
所有显示没有达到要求的选项都可以在``php.ini``文件中进行修改。
![php.ini](https://blog.freelytomorrow.com/articles_img/zabbix/php-ini.png)

## 安装过程中可能出现的错误

### 500报错
500报错是前后端没有建立有效的链接，或者后端无法提供服务。
首先要查看zabbix-server，php-fpm是否正常启动了；如果这两个没问题可以查看php-fpm的日志``/var/log/php-fpm/error.log``。
如果报错是：``Failed opening required '/etc/zabbix/web/maintenance.inc.php'``那么找到对应的文件，将他的属主属组修改问nginx的运行用户就可以了
``` bash
chown -R nginx.nginx /etc/zabbix/web/maintenance.inc.php
```
如果nginx父进程是是root运行的，则不会出现这个问题。

### 安装前端时网页大量报错
![php-session](https://blog.freelytomorrow.com/articles_img/zabbix/php-session.png)
这个保存的原因是缺少php的会话目录，使用一条命令修复：
``` bash
mkdir -p /var/lib/php/session && chmod 1733 /var/lib/php/session
```

### 无法显示中文
在选项中修改界面语言为中文后，中文全是方块，这是因为缺少zabbix所需的字体。
``` bash
# 安装字体
yum install wqy-microhei-fonts -y
# 替换默认字体
cp /usr/share/fonts/wqy-microhei/wqy-microhei.ttc /usr/share/zabbix/assets/fonts/graphfont.ttf 
```

## 自定义监控项
### 监控docker容器状态
首先创建一个shell脚本，这个脚本主要是利用``docker ps | grep``来查看指定的容器是否正在运行，如果正在运行则返回1，否则返回0
``` bash
#!/bin/bash
result=$(docker ps | grep $1)
if [ -z "$result" ]; then
    echo "0"
else
    echo "1"
fi
unset result
```
编写zabbix-agent监控项配置文件
``` bash
echo 'UserParameter=container.status[*],/bin/bash /etc/zabbix/scripts/docker_containers.sh $1' > /etc/zabbix/zabbix_agentd.d/docker_containers.conf
```
将docker用户组设置为zabbix用户的附加组
``` bash
usermod -aG docker zabbix
```
修改docker的socket文件权限
``` bash
chmod 666 /run/docker.sock
```
修改完权限后，zabbix用户才能有权限访问到docker的容器列表。
### 使用zabbix_get命令确认监控项是否生效
``` bash
zabbix_get -s 127.0.0.1 -k container.status[alist_alist_1]
```
如果得到了预期的结果(1或0)，则说明该监控项可以正常使用。

### 在zabbix前端配置监控项
#### 新建一个docker模板
![zabbix-template](https://blog.freelytomorrow.com/articles_img/zabbix/template.png)
#### 给模板创建监控项
![create](https://blog.freelytomorrow.com/articles_img/zabbix/create.png)
然后点击右上角：创建监控项
![create](https://blog.freelytomorrow.com/articles_img/zabbix/create2.png)
键值填写我们在zabbix-agentd.d目录下创建的配置文件，方括号中可以填docker的名字或者docker id。
#### 查看最新数据
![create](https://blog.freelytomorrow.com/articles_img/zabbix/data.png)
三个容器都在运行中。

### 创建触发器
触发器是当监控项满足一定条件时就会自动触发的动作，一般是用来提供告警信息，比如当某个容器的状态为0时，就提示警报。
![create](https://blog.freelytomorrow.com/articles_img/zabbix/trigger.png)
