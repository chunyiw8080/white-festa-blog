---
title: Ansible Role
published: 2022-10-11
pinned: false
description: 通过Ansible Role将单个剧本拆分为多个子文件，更便于复用、维护、修改和使用。
tags: [Ansible]
category: 运维自动化
draft: false
---

常规的ansible playbook，其中可能涉及到上传多份文件到远程主机，这样一来，配置文件，剧本等内容都放在一个文件夹内，非常混乱，不便于管理。<br>
Ansible Role可以将单个剧本拆分为多个子文件，更便于维护，修改和使用。

# Ansible Role介绍
role主要的作用是可以单独的通过一个有组织的结构、通过单独的目录管理如变量、文件、任务、模块、以及处理任务等，并且可以通过include导入使用这些目录。<br>
roles主要依赖于目录的命名和摆放，默认tasks/main.yml是所有任务的人口，使用roles的过程也可以认为是目录规范化命名的过程。<br>
roles每个目录下均由main.yml定义该功能的任务集，tasks/main.yml默认执行所有定义的任务；

## 配置文件
role目录被定义在ansible配置文件``/etc/ansible/ansible.cfg``中：
```
[root@master-61 /etc/ansible]#cat ansible.cfg | grep roles_path
#roles_path    = /etc/ansible/roles
```

## 目录规划
一个完整的roles是由task、handlers、files、vars、templates、meta等一系列目录组成，各目录存放不同的文件实现不同的功能，在调用时直接下文件名即可调用。<br>
参见：https://docs.ansible.com/ansible/latest/playbook_guide/playbooks_reuse_roles.html#role-directory-structure <br>

Ansible Role定义了八个主要的标准目录，每个ansible role playbook中至少包含其中一个目录，使用不到的目录可以省略。目录结构如下：
``` bash
.
├── ansible.cfg
├── hosts
└── roles
    └── commom
        ├── defaults
        ├── files
        ├── handlers
        ├── library
        ├── meta
        ├── tasks
        ├── templates
        └── vars
```
作用：
* tasks/main.yml  角色执行的任务的主要列表。
* handlers/main.yml  处理程序，可以在此角色内部或外部使用。
* library/my_module.py 可在此角色中使用的[模块](https://docs.ansible.com/ansible/latest/playbook_guide/playbooks_reuse_roles.html#embedding-modules-and-plugins-in-roles)
* defaults/main.yml- 角色的默认变量，或者说变量的默认值；具有最低的优先级，可以被主动覆盖。
* vars/main.yml- 角色的其他变量（有关更多信息，请参阅使用变量）。
* files/main.yml- 角色部署的文件。
* templates/main.yml- 角色部署的模板。
* meta/main.yml- 角色的元数据，包括角色依赖项。

# 实践
将之前的部署nfs的playbook以role的方式重写

## roles文件结构
``` bash
.
├── ansible.cfg
├── deploy_nfs.yml
├── hosts
├── roles
│   ├── deploy_nfs
│   │   │   └── main.yml
│   │   ├── tasks
│   │   │   └── main.yml
│   │   └── vars
│   │       └── main.yml
│   └── web_mount
│       ├── tasks
│       │   └── main.yml
│       └── vars
│           └── main.yml
└── web_mount.yml
```

## nfs服务端

### tasks/main.yml

``` yaml
- name: 01 - install apps
    yum:
    name: "{{ item }}"
    state: installed
    loop: "{{ apps }}"
- name: 02 - start and enable apps
    systemd:
    name: "{{ item }}"
    state: started
    enabled: true
    loop: "{{ apps }}"
- name: 03 - setup nfs configuration
    shell:
    cmd: "echo '/data 172.16.1.0/24(rw,sync,all_squash)' >> /etc/exports"

    notify:
    - start nfs
- name: 04 - change wordpress file user and group
    file:
    path: "{{ target_path }}"
    state: directory
    owner: nfsnobody
    group: nfsnobody
    recurse: true
```
### vars/main.yml

``` yaml
apps:
  - nfs-utils
  - rpcbind
target_path: /data
```

### handlers/main.yml

``` yaml
- name: start nfs
  systemd:
    name: nfs
    state: started
    enabled: true
```

### role启动文件deploy_nfs.yml
该文件和roles目录平级
``` yaml
- hosts: nfs
  roles:
    - deploy_nfs
```

## nfs服务端(web主机组)

### tasks/main.yml

``` yaml
- name: 01 - install apps
    yum:
    name: "{{ item }}"
    state: installed
    loop: "{{ apps }}"
- name: 02 - start and enable apps
    systemd:
    name: "{{ item }}"
    state: started
    enabled: true
    loop: "{{ apps }}"
- name: 03 - create mount directory
    file:
    path: "{{ mount_path }}"
    state: directory  
- name: 04 - mount
    mount:
    src: 172.16.1.31:/data
    path: "{{ mount_path }}"
    fstype: nfs
    state: mounted 
```

### vars/main.yml

``` yaml
apps:
  - nfs-utils
  - rpcbind
mount_path: /www
```

### role启动文件web_mount.yml
``` yaml
- hosts: web
  roles:
    - web_mount
```

