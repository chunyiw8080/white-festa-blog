---
title: 单机部署LNMP架构
published: 2022-05-12
pinned: false
description: 练习 - 部署LNMP单点架构
tags: [Nginx, WordPress, MySQL]
category: Web架构
draft: false
---

## 什么是LNMP架构
LNMP是常见的单机架构，通常用于业务的早期阶段或是个人业务，如博客；LNMP即 Linux系统+Nginx Web server+Mysql数据库+PHP后端程序的统称；<br>

## LNMP架构原理
LNMP工作流是的当用户通过浏览器访问Web服务时，其静态请求交由Nginx Web Server来处理，而动态请求则由Nginx通过FastCGI接口转发给本机的后端程序，即php-fpm进程进行解析；<br>

如果该请求需要读取MySQL数据库，则php-fpm会继续向后读取MySQL数据库，并一层一层地返回数据，最后由Nginx将数据返回给用户<br>

## 部署LNMP环境

### 创建Nginx运行用户
其实这部并非必要，yum安装Nginx的话安装过程中会自动创建一个Nginx用户，但是我习惯了用www用户来跑Web Server，所以还是创建一个。<br>

``` bash
groupadd www -g 500 
useradd www -s /sbin/nologin -M -u 500 -g 500
```

之后可以用id命令来检查一下用户创建是否成功。
``` bash
id www
```

### 安装Nginx，PHP和MySQL

#### 安装Nginx

``` bash
yum insatll nginx -y
```
#### 安装php-fpm及其依赖
先删除PHP旧环境
``` bash
yum remove php* -y
```
配置PHP的yum源和第三方源
``` bash
rpm -Uvh https://dl.fedoraproject.org/pub/epel/epel-release-latest-7.noarch.rpm
rpm -Uvh https://mirror.webtatic.com/yum/el7/webtatic-release.rpm
```

安装php-fpm及其依赖
``` bash
yum install -y php71w-cli php71w-common php71w-devel php71w-embedded php71w-gd php71w-mcrypt php71w-mbstring php71w-pdo php71w-xml php71w-fpm php71w-mysqlnd php71w-opcache php71w-pecl-memcached php71w-pecl-redis php71w-pecl-mongodb php71w-json php71w-pecl-apcu php71w-pecl-apcu-devel
```

修改php-fpm的运行用户和nginx一样
``` bash
sed -i '/^user/c user = www' /etc/php-fpm.d/www.conf
sed -i '/^group/c group = www' /etc/php-fpm.d/www.conf
```

或者也可以直接用Vim编辑/etc/php-fpm.d/www.conf文件，将第8行和第10行的user和group都等于www就行。

#### 部署MySQL
安装mysql服务端和客户端
``` bash
yum install mariadb-server mariadb -y
```

mysql和mariadb其实差不多的，mysql被收购后原开发者重新开发了mariadb，两者差别不大，mariadb的客户端甚至可以用来链接mysql的服务端，两者的命令也是一样的<br>

#### 启动服务并设置开机自启

``` bash
systemctl start nginx
systemctl enable nginx
 
systemctl start php-fpm
systemctl enable php-fpm
 
systemctl start mariadb
systemctl enable mariadb
```

###  MySQL初始化设置
root是MySQL的默认管理员用户，我们首先要为其设置密码。

``` bash
mysqladmin password ‘password’ #password用自己的密码进行替换
```
测试登录

``` bash
mysql -uroot -ppassword #-u 后面跟root用户名 -p后面跟用户名对应的密码
```

## 修改Nginx配置文件使其支持FastCGI
需要使用fastcgi_pass请求转发和fastcgi_param变量<br>

官方文档：
https://nginx.org/en/docs/http/ngx_http_fastcgi_module.html#fastcgi_pass      
https://nginx.org/en/docs/http/ngx_http_fastcgi_module.html#fastcgi_index<br>

配置示例：<br>

首先进入/etc/nginx/nginx.conf文件，确保include /etc/nginx/conf.d/*.conf;该行未被注释掉。<br>

然后进入include /etc/nginx/conf.d/目录内，新建一个.conf文件。<br>

``` nginx
server{ 
    listen 80; 
    server_name _; 
    # 静态请求，资源存放路径 root /code; index index.php index.html; 
    # 动态请求处理 
    location ~ \.php$ { 
        root /code; 
        fastcgi_pass 127.0.0.1:9000; 
        fastcgi_index index.php; 
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name; 
        include fastcgi_params; 
    } 
}
```

其中$document_root 表示当前locatin设置的root或是alias的目录，SCRIPT_FILENAME 用于在php中确定脚本名字，fastcgi_script_name 为请求的URL。<br>

location ~ \.php$ 是一个匹配规则，意思是所有以.php结尾的请求都会交由这个location下的配置进行处理也就是交由位于本机9000端口的php后端程序来处理。<br>

## 创建测试文件

### 创建创建phpinfo测试文件
首先创建之前在配置文件中写入的文件存放目录<br>

``` bash
mkdir /code
```

然后创建phpinfo文件

``` bash
touch /code/phpinfo.php 
cat >> /code/phpinfo.php << EOF 
<?php 
    phpinfo(); 
?> 
EOF
```
检查nginx语法并重载配置文件<br>

接下来可以使用ip/phpinfo.php，如192.168.0.7/phpinfo.php来查看是否成功。出现类似下面的页面就说明我们发送的动态请求成功地被nginx通过fastcgi转发给php后端进行处理了。
![phpinfo](https://blog.freelytomorrow.com/articles_img/single-lnmp/phpinfo.png)

### 测试与MySQL的链接
在/code目录下新建一个mysql-test.php文件，并写入如下内容

``` php
<?php
    $server="127.0.0.1"; 
    $mysql_user="root"; 
    $mysql_pwd="123456"; 
    // 创建数据库连接 
    $conn=mysqli_connect($server,$mysql_user,$mysql_pwd); 
    // 检测连通性 
    if($conn)
    { 
        echo "Connect to mysql database successful \n"; 
    }else 
    { 
        die( "Connection failed: " . mysqli_connect_error()); 
    } 
?>
```

然后访问ip/mysql-test.php文件，如果显示”Connect to mysql database successful”则说明与PHP与MySQL的链接正常。<br>

至此，LNMP架构就成功部署了。现在访问你的IP应该可以得到一个CentOS的介绍页面。<br>

## 部署Wordpress

### 创建虚拟主机的配置文件

``` nginx
server{ 
    listen 80; 
    server_name blog.free.cc; 
    # 静态请求，资源存放路径 root /code/wordpress; 
    index index.php index.html; 
    # 动态请求处理 
    location ~ \.php$ { 
        root /code/wordpress; 
        fastcgi_pass 127.0.0.1:9000; 
        fastcgi_index index.php; 
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name; include fastcgi_params; 
    } 
}
```

### 下载wordpress源码

``` bash
cd /code/ ; wget https://cn.wordpress.org/latest-zh_CN.zip
```

解压缩并授权
``` bash
unzip latest-zh_CN.zip
chown -R www.www /code/
```

### 创建MySQL数据库

``` bash
mysql -u"root" -p"password" -e "create database database_name"
```

### 进行wordpress安装
访问你的IP地址，可以看见一个安装导航界面<br>
数据库名填你刚刚自己创建的数据库名称；<br>
数据库主机填localhost:3306<br>
表前缀不重要，可改可不改。<br>


完成安装后就进入到了Wordpress后台，开始创造自己的网站把！



