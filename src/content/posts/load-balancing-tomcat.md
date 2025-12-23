---
title: Tomcat结合Nginx实现负载均衡与动静态分离
published: 2023-04-09
pinned: false
description: 从0到1实现Tomcat的负载均衡与Nginx动静态资源分离，配合ansible playbook做软件安装
tags: [Tomcat, Nginx, Ansible, 负载均衡]
category: Web架构
draft: false
---

## 什么是动静态分离
我们都知道一个网站中包含各种文件，如css文件，或者是媒体文件如jpg，png等；不同的web服务器擅长的领域不同，比如Nginx就是响应静态资源请求的王者，而Tomcat是专门用来处理Java应用的web服务器，虽然Tomcat一样可以解析静态资源请求，但在效率上就没法和Nginx相比了；<br>
因此，动静态分离就是利用Nginx的转发技术，当用户请求了servlet,jsp等文件时，将请求转发给Tomcat服务器，当用户请求的是其他的静态资源时，让Nginx代理服务器直接进行解析和响应，以此提升整体的响应效率。

## 动静态分离架构图
![structure](https://blog.freelytomorrow.com/articles_img/load-balancing-tomcat/structure.png)

## 部署负载均衡与动静态分离
机器环境：
|Hostname|公网IP|内网IP|作用|
|:----:|:----:|:----:|:----:|
|lb-6|10.0.0.6|172.16.1.6|Nginx负载均衡|
|web-7|10.0.0.7|172.16.1.7|Tomcat|
|web-9|10.0.0.9|172.16.1.9|Tomcat|
|master-61|10.0.0.61|172.16.1.61|Ansible|
|nfs-31|10.0.0.31|172.16.1.31|NFS|

### 使用Ansible部署Tomcat
``` yaml
- name: setup JDK and Tomcat
  hosts: web
  tasks:
    - name: 01 - copy jdk package
      copy:
        src: /opt/jdk-8u221-linux-x64.tar.gz
        dest: /opt/
    - name: 02 - unarchive jdk package
      unarchive: 
        src: /opt/jdk-8u221-linux-x64.tar.gz
        dest: /opt/
        remote_src: true
    - name: 03 - create soft link for jdk
      file:
        state: link
        src: /opt/jdk1.8.0_221/
        dest: /opt/jdk8
    - name: 04 - configure PATH variable
      lineinfile:
        dest: /etc/profile
        line: "{{ item }}"
      loop:
        - export JAVA_HOME=/opt/jdk8
        - export PATH=$JAVA_HOME/bin:$JAVA_HOME/jre/bin:$PATH
        - export CLASSPATH=.$CLASSPATH:$JAVA_HOME/lib:$JAVA_HOME/jre/lib:$JAVA_HOME/lib/tools.jar
    - name: 05 - download tomcat
      get_url:
        url: https://archive.apache.org/dist/tomcat/tomcat-8/v8.0.27/bin/apache-tomcat-8.0.27.tar.gz
        dest: /opt/
    - name: 06 - unarchive tomcat
      unarchive:
        src: /opt/apache-tomcat-8.0.27.tar.gz
        dest: /opt/
        remote_src: true
    - name: 07 - create soft link for tomcat
      file:
        src: /opt/apache-tomcat-8.0.27
        dest: /opt/tomcat8
        state: link
```
执行完剧本后,还需要手动使配置的``JAVA_HOME``等变量生效
``` bash
source /etc/profile
```
这是因为ansible远程执行的是non-login shell，不会加载``profile``和``bash_profile``下的变量，因此需要手动登录执行source；或者也可以写入``~/.bashrc``中，然后source一下``~/.bash_profile``使其生效。

### 部署NFS服务端

#### 安装nfs-utils和rpcbind工具包
``` bash
yum install nfs-utils rpcbind -y
```
#### 创建存放java apps的文件夹
```
mkdir /opt/jpress
```
#### 修改挂载配置
``` bash
echo '/opt/jpress 172.16.1.0/24(rw,sync,all_squash) ' >> /etc/exports
```
#### 修改挂载目录的属主属组
```
chown -R nfsnobody.nfsnobody /opt/jpress
```
#### 下载java app到挂载目录
这里使用的是jpress做实验，下载地址：https://www.jpress.cn/club/post/116

### 部署NFS客户端(在web服务器上)

#### 在两台机器上安装nfs-utils
``` bash
yum install nfs-utils -y
```
#### 在tomcat的webapps目录下创建jpress文件夹
``` bash
mkdir /opt/tomcat8/webapps/jpress
```
#### 将nfs目录挂载到jpress目录下
```
mount -t nfs 172.16.1.31:/opt/jpress /opt/tomcat8/webapps/jpress
```
#### 解压jpress.war
tomcat默认会对webapps目录下的.war或.jar包进行自动解压，但因为我们是通过远程挂载的方式执行的，war包在自创的目录下，tomcat识别不到，因此需要手动解压，使用``jar``命令：
``` bash
jar -xvf /opt/tomcat8/webapps/jpress/jpress.war
```
然后可以将war包删掉了。

### 部署Nginx负载均衡
安装好Nginx，修改配置文件``nginx.conf``
``` nginx
  upstream tomcat_pool {
  server 172.16.1.9:8080;
  server 172.16.1.7:8080;
  }
  server {
      listen       80;
      listen       [::]:80;
      server_name  _;

  location / {
      proxy_pass http://tomcat_pool;
      include /etc/nginx/proxy_params.conf;
}
```
转发参数：
``` nginx
proxy_set_header Host $http_host;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_connect_timeout 30;
proxy_send_timeout 60;
proxy_read_timeout 60;
proxy_buffering on; 
proxy_buffer_size 32k; proxy_buffers 4 128k;
```

到此为止负载均衡的配置就基本完毕了。

### 实现动静态分离
创建一个新的文件用于测试；
这里用得是一个能够生成随机数的jsp文件作为动态资源，和一张jpg图片作为静态资源，动静态分离主要还是基于nginx的location匹配规则。<br>
有两种匹配方式：
* 基于文件后缀匹配
* 基于文件路径匹配

#### 基于文件后缀匹配
一个典型的例子如下：
``` nginx
location ~ .*\.(jpg|png|html){
        root /opt/static/;
        expires 5d;
}
```
当用户请求的文件后缀和规则向匹配时，反向代理服务器会自动在本机的对应目录(通过nfs挂载的目录)中搜索内容并返回；
当然，最好的方法还是再增设一个Nginx静态请求解析服务器，负载均衡服务器只用作请求转发。

#### 基于文件路径匹配
这种方式需要运维或开发者预先设定好用于专门存放静态文件内容的目录；
例子：
``` nginx
location /static {
    alias   /usr/share/nginx/staticrs;
    index  index.html;
}
```

#### 生成随机数的jsp文件
``` java
<%@ page language="java" contentType="text/html; charset=UTF-8"
    pageEncoding="UTF-8"%>
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>随机数生成器</title>
</head>
<body>
    <h1>随机数生成器</h1>
    
    <%-- 使用Java代码生成随机数 --%>
    <% 
        java.util.Random random = new java.util.Random();
        int randomNumber = random.nextInt(100); 
        out.println("<p>随机数：" + randomNumber + "</p>");
    %>   
</body>
</html>
```
