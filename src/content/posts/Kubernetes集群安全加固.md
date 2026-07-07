---
title: Kubernetes集群基础安全加固
published: 2026-07-07
pinned: false
description: 针对 Kubernetes 集群中因 SHA-1 和 CBC 加密套件引发的安全审计问题，提供了一套完整的控制平面加固方案。内容涵盖SSH禁用弱加密套件和登录防暴力破解；Kubelet、kube-controller、scheduler、etcd等系统组件的TLS1.2加固策略。确保环境在提升安全评级的同时，业务连续性不受影响。
tags: [Kubernetes]
category: DevOps
draft: false
---

# 一、SSH加固

## 1. 废弃SSH弱加密算法

### 背景
此修复项用于废弃两项SSH弱加密算法，包括
- hmac-sha1
- hmac-sha1-etm@openssh.com

严格来说，这两个并不是加密算法，而是SSH的MAC（消息认证码）算法，用于保证数据完整性和防篡改，而不是用于加密数据内容。

由于2017年，SHA-1加密算法已被碰撞攻击攻破，因此SHA-1不再被视为是安全的加密算法，伴随着的是：
- TLS 已弃用 SHA-1
- 浏览器不再信任 SHA-1 证书
-  NIST 不推荐继续使用 SHA-1
- CIS Benchmark、DISA STIG、等保等基线普遍要求关闭

因此，关闭废弃这两个算法有助于提升环境的安全评级。然而，严格来说hmac-sha1并没有真正被攻破，真正导致它需要被禁用的原因是安全裕度不足，SHA-1只输出160 bit，而
- SHA256: 256 bit
- SHA384: 384 bit
- SHA512: 512 bit

既然有更好的加密算法，那么确实也没有必要留存这个不知道何时会被攻破，并且本身安全裕度不足的算法。

此外，很多安全扫描工具在扫到SHA-1算法后也会直接报高危漏洞，因此就算是仅仅为了通过安全审计，也有必要废弃此算法。

### 实现
1. 通过显式声明将此算法排除
```bash
sudo tee /etc/ssh/sshd_config.d/99-disable-weak-macs.conf > /dev/null <<'EOF'
MACs hmac-sha2-512-etm@openssh.com,hmac-sha2-256-etm@openssh.com,umac-128-etm@openssh.com,hmac-sha2-512,hmac-sha2-256,umac-128@openssh.com
EOF
```
2. 确认配置无误
```bash
sudo sshd -t
```
3. 重启sshd
```bash
sudo systemctl restart sshd
```
4. 确认配置有效
```bash
sshd -T | grep macs
```

## 2. 提升登陆失败时的重试间隔
一条命令就能实现
```bash
echo "auth optional pam_faildelay.so delay=5000000" | sudo tee -a /etc/pam.d/common-auth
```
此项设置让单次SSH登陆失败后，必须经过5s的等待时间才能尝试重新登陆，可以降低暴力破解的攻击效率

# 二、TLS安全加固

## 1. 背景
Kubernetes默认使用了两项基于CBC + SHA1的TLS1.2加密套件:
- TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA
- TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA

原理和之前的SSH加固其实一样，都是SHA-1被攻破和本身的安全裕度不足导致了加密算法可靠性的大幅度降低；TLS1.2中弃用这些套件，除了SHA-1碰撞风险外，更核心的漏洞在于CBC模式（密码块链接模式）容易遭受诸如*Lucky*、*Thirteen*、*POODLE*等针对填充漏洞的侧信道攻击。

加固的目标是禁用上述 TLS 1.2 下较旧的 CBC + SHA-1 类套件，统一改用*GCM*或*CHACHA20*套件，并覆盖以下端口和组件
| Port | Component |
| :--: | :-------: |
|10250/tcp|kubelet HTTPS API|
|2379/tcp |etcd client API|
|2380/tcp |etcd peer 通信|
|10257/tcp |kube-controller-manager HTTPS/metrics|
|10259/tcp |kube-scheduler HTTPS/metrics|

## 2. 推荐安全套件
Kubernetes 组件和 etcd 建议统一使用以下 Go 标准全名:
- TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256
- TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256
- TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256
- TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384
- TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
- TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384

## 3. 实现

### 3.1. 备份旧Manifest文件
```bash
mkdir -p /root/k8s-manifest-backups/

cp -r /etc/kubernetes/manifests/* /root/k8s-manifest-backups/
```

### 3.2 修改 kubelet，处理 10250/tcp
1. 修改所有节点的kubelet配置文件: ``/var/lib/kubelet/config.yaml``，加入或更新
```
tlsMinVersion: VersionTLS12
tlsCipherSuites:
- TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256
- TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256
- TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256
- TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384
- TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
- TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384
```
重启kubelet
```bash
systemctl restart kubelet && systemctl status kubelet
```

2. 修改 kube-system 下的 kubelet 配置 ConfigMap
这可以确保后续 kubeadm upgrade 或节点重建时配置不会被覆盖
```bash
# 先保存当前配置
kubectl get cm kubelet-config -n kube-system -o yaml > /root/k8s-manifest-backups/kubelet-config-ori.yaml
# 然后编辑
kubectl edit cm kubelet-config -n kube-system
```
在``.data.kubelet``层级下，增加前一步的tls配置并保存

或者也可以直接patch

```bash
kubectl patch cm kubelet-config -n kube-system --type merge -p '
data:
  kubelet: |
    {"tlsMinVersion":"VersionTLS12","tlsCipherSuites":["TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256","TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256","TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256","TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384","TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256","TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384"]}
'
```

### 3.3 修改 kube-controller-manager，处理 10257/tcp
修改每个Control Plane节点上的``/etc/kubernetes/manifests/kube-controller-manager.yaml``文件，在command层级下加入:
```yaml
- --tls-min-version=VersionTLS12
- --tls-cipher-suites=TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256,TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256,TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256,TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384,TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256,TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384
```
保存并退出，在约30s内，static pod会被自动重建

### 3.4 修改 kube-scheduler，处理 10259/tcp
修改每个Control Plane节点上的``/etc/kubernetes/manifests/kube-scheduler.yaml``文件，在command层级下加入:
```yaml
- --tls-min-version=VersionTLS12
- --tls-cipher-suites=TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256,TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256,TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256,TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384,TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256,TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384
```
保存并退出，在约30s内，static pod会被自动重建

### 3.5 修改 etcd，处理 2379/tcp 和 2380/tcp
修改每个Control Plane节点上的``/etc/kubernetes/manifests/etcd.yaml``文件，在command层级下加入:

:::warning
注意！etcd的配置和其他的不太一样，算法声明使用的是``--cipher-suites``，而不是``--tls-cipher-suites``
:::

```yaml
- --tls-min-version=TLS1.2
- --cipher-suites=TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256,TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256,TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256,TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384,TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256,TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384
```

etcd 建议逐台处理，等待当前节点 etcd 恢复健康后再处理下一台；监控etcd上线:
```bash
# 确保Pod状态为running
kubectl -n kube-system get pod -l component=etcd -o wide
# 在 etcd pod 内执行检查，确保 member 已加入集群
kubectl exec -n kube-system <etcd-pod-name> -- etcdctl endpoint health --cluster
```

# 三、验证

## 1. 确认组件状态
确保节点和基础组件均为*Ready*和*Running*状态
```bash
kubectl get nodes
kubectl -n kube-system get pod -o wide | grep -E 'kube-controller-manager|kube-scheduler|etcd'
```

## 2. 复扫端口
1. 复扫全部节点
```bash
nmap --script ssl-enum-ciphers -p 10250 <ip>
```
2. 复扫 Control Plane 节点
```bash
nmap --script ssl-enum-ciphers -p 2379,2380,10257,10259 <ip>
```

## 3. 检查实际容器启动参数
建议在每台 control-plane 节点执行。而不是只依赖旧缓存信息:
```bash
crictl --runtime-endpoint unix:///run/containerd/containerd.sock ps -a | grep -E 'etcd|kube-controller-manager|kube-scheduler'

for name in etcd kube-controller-manager kube-scheduler; do
    id=$(crictl --runtime-endpoint unix:///run/containerd/containerd.sock ps --name "$name" -q | head -1)
    echo "$name $id"
    crictl --runtime-endpoint unix:///run/containerd/containerd.sock inspect "$id" | grep -E 'tls-min-version|cipher-suites|CHACHA20'
done

ps axww | grep '[k]ubelet' | grep -E 'tls-min-version|tls-cipher-suites'
```