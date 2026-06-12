---
title: Ansible入门
published: 2022-08-11
pinned: false
description: ansible入门基础教学
tags: [Ansible]
category: 运维自动化
draft: false
---

Ansible是一个同时管理多个远程主机的软件（任何可以通过SSH协议登录的机器），因此Ansible可以管理远程虚拟机、物理机，也可以是本地主机（linux、windows）。

Ansible通过SSH协议实现管理节点、远程节点的通信。

ansible作为运维自动化的核心软件之一，可以让我们把双手从机械性的重复劳动中解放出来，简单快捷的管理大量主机。

# Ansible的安装和部署

## 安装Ansible软件
配置好了软件源后可以使用一条命令安装：
``` bash
yum install ansible libselinux-python -y
```

查看Ansible版本
``` bash
ansible --version
ansible 2.9.27
  config file = /etc/ansible/ansible.cfg
  configured module search path = [u'/root/.ansible/plugins/modules', u'/usr/share/ansible/plugins/modules']
  ansible python module location = /usr/lib/python2.7/site-packages/ansible
  executable location = /usr/bin/ansible
  python version = 2.7.5 (default, Oct 14 2020, 14:45:30) [GCC 4.8.5 20150623 (Red Hat 4.8.5-44)]
```
## 配置Ansible主机清单
修改/etc/ansible/hosts文件
### 清单模式
主机清单有两种模式，一种是分组清单，一种是普通清单(无分组)。<br>
分组清单：
``` bash
[web]
172.16.1.7
172.16.1.9
```

普通清单就是把组标号去掉。<br>
清单不仅仅支持IP，也支持域名，如：
``` bash
[site]
web.example.com
db.example.com
```
### 范围匹配模式

``` bash
web-[7:9].example.com
```
这意味着将web-7.example.com，web-8.example.com，web-9.example.com都加入清单中。

## Ansible主机登录认证

### 基于密码认证
在hosts文件中增加登录参数配置；有以下几个参数：
|参数|参数类型|
|:----:|:----:|
|ansible_host|主机地址|
|ansible_port|主机端口|
|ansible_user|操作用户|
|ansible_password|登录密码|

修改后如下：
``` bash
[web]
172.16.1.7 ansible_port=22 ansible_user=root ansible_password=123456
172.16.1.9 ansible_port=22000 ansible_user=root ansible_password=123123
```
#### 通用变量配置
如果当前清单中有多个主机组，而每个主机组的参数配置都一样，则可以使用通用配置，免去在每个主机后面加上参数配置。如：
``` bash
[web:vars]
ansible_ssh_port=22000
ansible_ssh_user=root
ansible_ssh_pass=123123

[web]
172.16.1.7
172.16.1.9
```
[web:vars]中的配置将自动用于所有web组下的主机。

### 基于免密登录
在使用ansible前通过ssh-keygen和ssh-copy-id两条命令将本机秘钥发送至目标主机，由此实现免密登录，这样就无需再对登录密码进行配置。

# ansible-doc 命令
该命令是ansible的说明文档命令，可以通过此命令查看ansible支持的模块，具体模块的使用方法等。<br>
查看ansible支持的所有模块
``` bash
ansible-doc -l
```

查看具体某个模块的用法，以command模块为例
``` bash
[root@master-61 ~/.ssh]#ansible-doc -s command
- name: Execute commands on targets
  command:
      argv:                  # Passes the command as a list rather than a string. Use `argv'
                               to avoid quoting values that
                               would otherwise be interpreted
                               incorrectly (for example "user
                               name"). Only the string or the
                               list form can be provided, not
                               both.  One or the other must
                               be provided.
      chdir:                 # Change into this directory before running the command.
      cmd:                   # The command to run.
      creates:               # A filename or (since 2.0) glob pattern. If it already exists,
                               this step *won't* be run.
      free_form:             # The command module takes a free form command to run. There is
                               no actual parameter named
                               'free form'.
      removes:               # A filename or (since 2.0) glob pattern. If it already exists,
                               this step *will* be run.
      stdin:                 # Set the stdin of the command directly to the specified value.
      stdin_add_newline:     # If set to `yes', append a newline to stdin data.
      strip_empty_ends:      # Strip empty lines from the end of stdout/stderr in result.
      warn:                  # Enable or disable task warnings.
```

# Ansible执行命令结果(状态颜色)

* <font color=green>绿色：命令以用户期望的执行了，但是状态没有发生改变；</font>
* <font color=yellow>黄色：命令以用户期望的执行了，并且状态发生了改变；</font>
* <font color=purple>紫色：警告信息，说明ansible提示你有更合适的用法；</font>
* <font color=red>红色：命令错误，执行失败；</font>
* <font color=blue>蓝色： 详细的执行过程；</font>




