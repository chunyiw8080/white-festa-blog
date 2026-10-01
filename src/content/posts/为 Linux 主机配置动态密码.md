---
title: 为 Linux 主机配置动态密码
published: 2026-09-30
pinned: false
description: 通过 Google Authenticator 和 PAM 为 Linux 主机的 SSH 登录配置动态验证码，支持密码或密钥搭配动态码认证，并介绍登录验证、时间同步与用户豁免的配置方法。
tags:
  - Linux
category: Linux软件部署及使用
draft: false
---

为 Linux 主机的 SSH 登录增加一层动态验证码校验，可以降低密码或私钥泄露后被直接登录的风险。本文以使用 DNF 的 Linux 系统为例，通过 Google Authenticator 和 PAM 配置基于时间的一次性密码（TOTP），使用 Microsoft Authenticator 扫码生成验证码，并介绍密码或密钥搭配动态码的配置方式。

# 部署动态密码
## 1. 安装软件包
```bash
sudo dnf install -y epel-release   # RHEL 上如果装不了，用：
# sudo dnf install -y https://dl.fedoraproject.org/pub/epel/epel-release-latest-9.noarch.rpm
sudo dnf install -y google-authenticator qrencode
```

## 2. 为要登录的用户生成密钥（用该用户身份执行，不要用 sudo）
```bash
google-authenticator -t -d -f -r 3 -R 30 -w 3
```
1. 终端会显示一个二维码和几个应急恢复码。在 Microsoft Authenticator 里点扫这个二外码，会自动生成和 hostname 名称相同的令牌。
2. 应急码要另外保存好。密钥写在 `~/.google_authenticator` 里。

## 3. 配置动态密码登录
**⚠️ 开始前先另外开一个 root 的 SSH 会话，并且全程不要关掉。** 配置出错时可以用它回滚，避免让自己也无法登录。


1. 编辑 `/etc/pam.d/sshd`，在 `auth substack password-auth` 这一行**上方**增加如下配置
```
auth required pam_google_authenticator.so
```
2. 配置 sshd，在 `/etc/ssh/sshd_config.d/` 下新建一个文件，叫做`40-mfa.conf`，填入
```
KbdInteractiveAuthentication yes
UsePAM yes
AuthenticationMethods keyboard-interactive
```
其中`AuthenticationMethods keyboard-interactive`表示同时启用密码和动态密码登录，如果需要使用密钥+动态码，可以修改为`AuthenticationMethods publickey,keyboard-interactive`；

如果使用密钥+动态密码的认证形式，还需要在`/etc/pam.d/sshd` 里注释掉 `auth substack password-auth`，否则登录时仍然会要求输入密码。

## 4. 检查配置并重启 sshd
```bash
sudo sshd -t && sudo systemctl restart sshd
```
然后**新开一个终端**测试登录，应该会先提示 `Password:`（或者直接用密钥认证），再提示 `Verification code:`，如图：
![mfa.png](https://images.white-festa.net/file/posts/1790836937355_mfa.png)
确认能正常登录后，再关掉之前保留的会话。
# 常见问题
## 1. 确保时间同步正确
虚拟机的时间必须准确，TOTP 依赖时间同步。用 `timedatectl` 确认 `System clock synchronized: yes`，没有同步的话启用 `chronyd`。
在内网环境里可以先搭建一个 NTP 服务器从权威 NTP 获取时间，然后内网服务器从这台内部 NTP 中同步时间

## 2. 豁免用户
如果想要让尚未完成 mfa 配置的用户能正常登录，可以在
```
auth required pam_google_authenticator.so
```
这行配置最后，增加`nullok`，这样就只有已经完成 mfa 配置的用户强制使用动态密码，尚未配置的用户仍可以正常登录；不过最佳实践是直接强制开启动态密码，尚未配置的用户让管理员手动用`su - <username>`切换用户，生成二维码，然后给用户来扫。