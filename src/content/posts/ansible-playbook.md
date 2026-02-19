---
title: Ansible-playbook高级用法
published: 2022-09-25
pinned: false
description: 在ansible playbook中使用循环、vars和when等方法实现ansible条件式功能
tags: [Ansible]
category: 运维自动化
draft: false
---

Ansible Playbook是基于Yaml语法的ansible命令文件，简单来说，可以理解为linux的普通命令和shell脚本的区别，通过playbook，可以实现更复杂的操作。<br>
下面是一个部署nfs远程挂载的ansible playbook
``` yaml
--- 
- name: setup nfs server
  hosts: nfs
  tasks:
    - name: 01 - install nfs-utils
      yum:
        name: nfs-utils
        state: installed
    - name: 02 - install rpcbind
      yum:
        name: rpcbind
        state: installed
    - name: 03 - start and enable nfs-utils
      systemd:
        name: nfs-utils
        state: started
        enabled: true
    - name: 04 - start and enable rpcbind
      systemd:
        name: rpcbind
        state: started
        enabled: true
    - name: 05 - setup nfs configuration
      shell:
        cmd: "echo '/data 172.16.1.0/24(rw,sync,all_squash)' >> /etc/exports"
    - name: 06 - change wordpress file user and group
      file:
        path: /data
        state: directory
        owner: nfsnobody
        group: nfsnobody
        recurse: true
    - name: 09 - start and enable nfs
      systemd:
        name: nfs
        state: started
        enabled: true

- name: mount wordpress files to web server
  hosts: web
  tasks: 
    - name: 01 - install rpcbind
      yum:
        name: rpcbind
        state: installed
    - name: 02 - install nfs-utils
      yum:
        name: nfs-utils
        state: installed
    - name: 03 - start and enable nfs-utils
      systemd:
        name: nfs-utils
        state: started
        enabled: true
    - name: 04 - create mount directory
      file:
        path: /www
        state: directory
    - name: 05 - restart rpcbind
      systemd:
        name: rpcbind
        state: restarted
        enabled: true
    - name: 06 - mount
      mount:
        src: 172.16.1.31:/wordpress
        path: /www
        fstype: nfs
        state: mounted
```

从这个playbook可以看出，部分内容是重复的，但是通过playbook的高级用法可以更简单的实现相同的功能。

# Loop循环
* 使用loop关键字定义循环变量
* 使用item关键字提取loop每次循环出来的值

以nfs服务器中安装nfs-utils和rpcbind为例，使用loop可以让我们在一个模块中安装两个应用。
```yaml
--- 
- name: install nfs-utils and rpcbind
  hosts: nfs
  tasks:
    - name: installation
      yum:
        name: "{{ item }}"
        state: installed
      loop:
        - nfs-utils
        - rpcbind
```
如此一来，我们就实现了通过循环安装多个软件。<br>
但是，可以发现我们后面一样要通过systemd模块来运行并为这两个应用设置开机自启；目前loop循环是置于name: installation下面，没办法在其他的模块中使用，因此，引入下一个概念：vars

# 使用vars定义循环列表
通过vars关键字我们可以为循环配置一个变量名，让这个循环可以被同级的任何一个模块使用。
```yaml
--- 
- name: setup nfs applications
  hosts: nfs
  vars:
    app:
      - nfs-utils
      - rpcbind
  tasks:
    - name: installation
      yum:
        name: "{{ item }}"
        state: installed
      loop: "{{ app }}"
    - name: start and set enabled
      systemd:
        name: "{{ item }}"
        state: started
        enabled: true
      loop: "{{ app }}"
```

# 循环处理字典数据
假如我要创建三个文件，他们的属主各不相同，应该如果实现呢？
```yaml
--- 
- name: create files for three different users
  hosts: web
  tasks:
  - name: create files
    file:
      path: "{{ item.path }}"
      state: touch
      owner: "{{ item.owner }}"
    loop:
      - {path: '/opt/mike.txt', owner: mike}
      - {path: '/opt/sarah.txt', owner: sarah}
      - {path: '/opt/john.txt', owner: john}
```

当然，字典循环也可以被声明成一个变量，和之前的差不多，就不加赘述了。

# Register将模块的输出结果注册为变量
Register可以将模块的执行结果注册为一个变量，并通过``debug``模块中的.``stdout_lines``输出到ansible管理终端。<br>
例如，我想要知道一个文本文件中有多少行：
```yaml
--- 
- name: how many lines for the text file
  hosts: 172.16.1.105
  tasks:
  - name: count lines
    shell:
      cmd: "cat /opt/testfile.txt | wc -l"
    register: lines

  - name: output the value
    debug:
      msg: "{{ lines.stdout_lines }}"
```

### 注册多个变量并和loop结合使用
在之前的基础上再查看一下目标主机名
```yaml
--- 
- name: register and loop
  hosts: 172.16.1.105
  tasks:
  - name: count lines
    shell:
      cmd: "cat /opt/testfile.txt | wc -l"
    register: lines
  - name: show hostname
    shell:
      cmd: "cat /etc/hostname"
    register: hostname

  - name: output the value
    debug:
      msg: "{{ item }}"
    loop:
      - lines.stdout_lines
      - hostname.stdout_lines
```
# When条件判断
when通常和register组合使用，以实现通过判断执行结果来指定后续操作。<br>
以查看文件为例：
```yaml
--- 
- name: how many lines for the text file
  hosts: 172.16.1.105
  tasks:
  - name: count lines
    shell:
      cmd: "cat /opt/testfile.txt"
    ignore_errors: true
    register: result

  - name: output the value
    debug:
      msg: "FATAL: File does not exists"
    when: result is failed
```
``ignore_errors``: 忽略报错继续向后执行

与ansible的内置变量相结合，还可以实现更多的有趣的功能；比如我想为web主机组下的所有主机创建一个文件，但其中一台主机不包括在内，这就可以用内置变量加条件判断的方法来实现：
```yaml
--- 
- name: how many lines for the text file
  hosts: web
  tasks:
  - name: count lines
    file:
      path: /opt/file.txt
      state: touch
    when: inventory_hostname != "172.16.1.7"
```
``inventory_hostname``: 目标主机名 - 取决于你在hosts文件中是如何配置的(ip或者别名)

# Notify和Handler
当调用某个任务确实执行了，且状态changed为true，notify就会执行指定的handler事件<br>
还是以创建文件为例：
```yaml
---
- hosts: web
    tasks:
    - name: create file
        file:
        path: /opt/testfile.txt
        state: touch
        mode: 600
        notify:
        - output message
    
    handlers:
    - name: output message
        debug:
        msg: "File created"
```

# 使用Tags为不同的task打标签，实现剧本的部分执行

```yaml
- name: deploy nfs
    hosts: nfs
    tasks:
    - name: 01 - install nfs-utils
    yum: name=nfs-utils state=installed
    tags: 01_install_nfs_service

    - name: 02 - install rpcbind
    yum: name=rpcbind state=installed
    tags: 02_install_rpcbind_service

    - name: 03 - create group
    group: name=www gid=666
    tags: 03_add_group

    - name: 04 - create user
    user: name=www uid=666 group=www create_home=no shell=/sbin/nologin
    tags: 04_add_user
```

显示剧本的所有tag标签：
```
ansible-playbook --list-tags playbook.yml
```

使用-t参数根据tag执行部分剧本：
```
ansible-playbook -t tag名 playbook.yml
```

# 对一开始的部署nfs挂载剧本进行改造

``` yaml
--- 
- name: setup nfs server
  hosts: nfs
  vars:
    app:
      - nfs-utils
      - rpcbind
  tasks:
    - name: 01 - install apps
      yum:
        name: "{{ item }}"
        state: installed
      loop: "{{ app }}"
    - name: 02 - start and enable apps
      systemd:
        name: "{{ item }}"
        state: started
        enabled: true
      loop: "{{ app }}"
    - name: 03 - setup nfs configuration
      shell:
        cmd: "echo '/data 172.16.1.0/24(rw,sync,all_squash)' >> /etc/exports"
      notify:
        - start NFS

      handlers:
        - name: start NFS
          systemd:
            name: nfs
            state: started
            enabled: true
    - name: 04 - change wordpress file user and group
      file:
        path: /data
        state: directory
        owner: nfsnobody
        group: nfsnobody
        recurse: true

- name: mount directory to web server
  hosts: web
  vars:
    app:
      - nfs-utils
      - rpcbind  
  tasks: 
    - name: 01 - install apps
      yum:
        name: "{{ item }}"
        state: installed
      loop: "{{ app }}"
    - name: 02 - start and enable apps
      systemd:
        name: "{{ item }}"
        state: started
        enabled: true
      loop: "{{ app }}"
    - name: 03 - create mount directory
      file:
        path: /www
        state: directory  
    - name: 04 - mount
      mount:
        src: 172.16.1.31:/data
        path: /www
        fstype: nfs
        state: mounted   
```


