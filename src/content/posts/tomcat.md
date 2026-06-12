---
title: Tomcat安装和配置
published: 2023-03-29
pinned: false
tags: [Tomcat]
category: Linux软件部署及使用
draft: false
---

## 通过yum源安装
### 安装JDK
可以通过yum list来查看可用的jdk包
``` bash
yum list java*
```
这种包名中带有devel的都是jdk包：
```
java-1.6.0-openjdk-devel.x86_64
java-1.7.0-openjdk-devel.x86_64 
java-1.8.0-openjdk-devel.x86_64  
```

### 安装tomcat
``` bash
yum install tomcat tomcat-webapps tomcat-admin-webapps -y
```
查看tomcat版本
``` bash
[root@tomcat-85 ~]#tomcat version
Server version: Apache Tomcat/7.0.76
Server built:   Nov 16 2020 16:51:26 UTC
Server number:  7.0.76.0
OS Name:        Linux
OS Version:     3.10.0-1160.el7.x86_64
Architecture:   amd64
JVM Version:    1.8.0_382-b05
JVM Vendor:     Red Hat, Inc.
```

## 通过压缩包安装

### 安装JDK
#### 通过Oracle官方下载JDK
https://www.oracle.com/java/technologies/javase/javase8u211-later-archive-downloads.html
#### 解压缩
``` bash
tar -xf jdk-8u221-linux-x64.tar.gz -C /opt/jdk
```
#### 设置软连接
``` bash
ln -s /opt/jdk/jdk1.8.0_221/ /opt/jdk8
```
#### 配置PATH变量
在``/etc/profile``文件中加入：
``` bash
export JAVA_HOME=/opt/jdk8
export PATH=$JAVA_HOME/bin:$JAVA_HOME/jre/bin:$PATH
export CLASSPATH=.$CLASSPATH:$JAVA_HOME/lib:$JAVA_HOME/jre/lib:$JAVA_HOME/lib/tools.jar

# 立即生效配置
source /etc/profile
```
#### 查看java版本
``` bash
[root@tomcat-85 /opt]#java -version
java version "1.8.0_221"
Java(TM) SE Runtime Environment (build 1.8.0_221-b11)
Java HotSpot(TM) 64-Bit Server VM (build 25.221-b11, mixed mode)
```

### 安装Tomcat
#### 下载tomcat
``` bash
wget https://archive.apache.org/dist/tomcat/tomcat-8/v8.0.27/bin/apache-tomcat-8.0.27.tar.gz
```
#### 解压缩
``` bash
tar -xf apache-tomcat-8.0.27.tar.gz
```
#### 设置软连接
``` bash
ln -s apache-tomcat-8.0.27 /opt/tomcat8
```
#### 检查tomcat是否识别了jdk
``` bash
[root@tomcat-85 /opt/tomcat8]#/opt/tomcat8/bin/version.sh
Using CATALINA_BASE:   /opt/tomcat8
Using CATALINA_HOME:   /opt/tomcat8
Using CATALINA_TMPDIR: /opt/tomcat8/temp
Using JRE_HOME:        /opt/jdk8
Using CLASSPATH:       /opt/tomcat8/bin/bootstrap.jar:/opt/tomcat8/bin/tomcat-juli.jar
Server version: Apache Tomcat/8.0.27
Server built:   Sep 28 2015 08:17:25 UTC
Server number:  8.0.27.0
OS Name:        Linux
OS Version:     3.10.0-1160.el7.x86_64
Architecture:   amd64
JVM Version:    1.8.0_221-b11
JVM Vendor:     Oracle Corporation
```
## Tomcat配置文件
tomcat有两个重要的配置文件，一个是``server.xml``该文件是tomcat的主配置文件，用于配置端口号等；另一个是``tomcat-users.xml``，该文件用于配置tomcat的管理员账户。

## Tomcat管理
对于通过yum源安装的tomcat，正常使用systemctl服务管理命令即可；对于通过压缩包安装的，tomcat提供了程序管理脚本，都在``bin/``目录下。
启动tomcat:
``` bash
[root@tomcat-85 /opt/tomcat8]#/opt/tomcat8/bin/startup.sh 
Using CATALINA_BASE:   /opt/tomcat8
Using CATALINA_HOME:   /opt/tomcat8
Using CATALINA_TMPDIR: /opt/tomcat8/temp
Using JRE_HOME:        /opt/jdk8
Using CLASSPATH:       /opt/tomcat8/bin/bootstrap.jar:/opt/tomcat8/bin/tomcat-juli.jar
Tomcat started.
```
停止tomcat服务：
``` bash
[root@tomcat-85 /opt/tomcat8]#/opt/tomcat8/bin/shutdown.sh 
Using CATALINA_BASE:   /opt/tomcat8
Using CATALINA_HOME:   /opt/tomcat8
Using CATALINA_TMPDIR: /opt/tomcat8/temp
Using JRE_HOME:        /opt/jdk8
Using CLASSPATH:       /opt/tomcat8/bin/bootstrap.jar:/opt/tomcat8/bin/tomcat-juli.jar
```
启动后可以看到Tomcat的后台管理页面<br>
![tomcat-backend](https://blog.freelytomorrow.com/articles_img/tomcat-start/tomcat-backend.png)
### 配置管理员账户
上面的页面是tomcat的后台管理账户，右上角的几个选项提供了检查服务器状态，管理java apps等功能，这些功能需要通过管理员账户来使用；
Tomcat默认没有管理员账户，点击上面的任意选项会提示登录，点击取消后会出现这样的提示信息：<br>
![tomcat-hint](https://blog.freelytomorrow.com/articles_img/tomcat-start/tomcat-hint.png)<br>
按照提示进行配置即可

修改``tomcat-users.xml``文件如下：
``` xml
<?xml version='1.0' encoding='utf-8'?>
<tomcat-users>
<role rolename="manager-gui"/>
 <role rolename="admin-gui"/>
 <user username="tomcat" password="abc123" roles="manager-gui,admin-gui"/>
</tomcat-users>
```
然后重启tomcat以加载配置


## 部署java应用
tomcat部署java应用的方式非常简单，只要将打包的.jar或.war包移动到``webapps/``目录下，就会自动完成加压和部署等操作；<br>

以jpress为例：<br>
在这里下载：https://www.jpress.cn/club/post/116

移动jpress.war到webapps目录下
``` bash
mv jpress.war /usr/share/tomcat/webapps
```
登入tomcat后台管理界面，点击Manager APP选项，可以发现tomcat已经检测到了jpress应用<br>
![management-jpress](https://blog.freelytomorrow.com/articles_img/tomcat-start/management-jpress.png)<br>

访问jpress
直接访问路径就可以：ip:port/jpress
安装界面正常显示<br>
![jpress-install](https://blog.freelytomorrow.com/articles_img/tomcat-start/jpress-install.png)


