---
title: 使用ansible-role模板部署redis
published: 2022-11-05
pinned: false
description: 一个使用ansible template部署redis的示例，结合的vars等功能的使用
tags: [Ansible]
category: 运维自动化
draft: false
---

# JinJa2模板文件
JinJa2是一个特有的模板语言，主要作用就是能让普通的文件，能读取程序设置的变量，用模板语法，动态替换数据。<br>
语法规则：
* 配置文件必须是以.j2为后缀
* 必须放入在template目录下
* 使用的ansible模块是template模块

例如：<br>
``shd_config``文件是SSH服务端的配置文件，其中Port字段指明了sshd服务的链接端口号。将该字段的值替换为变量，并在``vars/main.yml``中配置，可以动态地修改这个变量的值。

# 实践：部署redis

## tasks/main.yml

``` yaml
- name: 01 - install requirement apps
  yum:
    name: "{{ item }}"
    state: installed
  loop: "{{ requirements }}"
- name: 02 - create data directory
  file:
    path: "{{ item }}"
    state: directory
  loop: "{{ data_dir }}" 
- name: 03 - download redis
  get_url:
    validate_certs: false
    url: "{{ source_url }}"
    dest: "{{ redis_package }}"
    force: true
- name: 04 - unarchive redis
  unarchive:
    src: "{{ redis_package }}"
    dest: /opt/
    remote_src: true
- name: 05 - redis complie
  make:
    chdir: /opt/redis-5.0.7
    target: "{{ item }}"
  loop: "{{ compile_target }}"
- name: 06 - copy config file to db-51
  template:
    src: redis.j2
    dest: "{{ redis_conf }}"
- name: run redis-server
  shell: 
    cmd: redis-server "{{ redis_conf }}"
```

## vars/main.yml
``` yaml
requirements:
  - gcc
  - make
data_dir:
  - /opt/redis
  - /opt/redis/conf
  - /opt/redis/pid
  - /opt/redis/logs
  - /opt/redis/data
source_url: http://download.redis.io/releases/redis-5.0.7.tar.gz
redis_package: /opt/redis-5.0.7.tar.gz
compile_target:
  - MALLOC=libc
  - install
redis_conf_dest: /opt/redis/conf/redis.conf

bind_ip: 127.0.0.1 172.16.1.51 10.0.0.51
redis_port: 6379
redis_pid_file: /opt/redis/pid/redis.pid
redis_log_file: /opt/redis/logs/redis.log
```

## redis配置文件redis.j2
``` bash
daemonize yes
bind {{ bind_ip }}
port {{ redis_port }}
pidfile {{ redis_pid_file }}
logfile {{ redis_log_file }}
```

## role启动文件
``` yaml
- hosts: db
  roles:
    - deploy_redis
```

通过这种方式，每个playbook可以被多次复用，对于不同的配置只需要对vars进行更改。
