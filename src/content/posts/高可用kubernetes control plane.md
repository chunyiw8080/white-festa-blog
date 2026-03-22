---
title: 将单点Control Plane的Kubernetes扩充为多个Control Plane实现集群高可用性
published: 2026-03-22
pinned: false
description: 结合Nginx负载均衡，keepalived + VIP机制实现的三控制平面的kubernetes集群
tags: [Kubernetes]
category: 容器
draft: false
---

# 一、基础环境
1. 一个已经全部节点都已Ready的kubernetes集群，包含一控制平面、二工作节点
2. 两台台将要作为Control Plane加入集群的新虚拟机
3. 使用kubeadm 1.31.14、kubelet 1.31.14 和 kubectl 1.31.14
4. 两台虚拟机各部署一套Nginx + keepalived服务

# 二、配置Nginx + Keepalived

## 1. 安装并设置为开机自启
```bash
# 安装
# conntrack是一个kubeadm在加入集群时所需的依赖，这里先安装一下防止加入集群失败
yum install nginx keepalived conntrack -y

# 确保nginx有stream模块
yum install nginx-mod-stream -y

# 设置开机自启
systemctl enable --now nginx
systemctl enable --now keepalived
```
## 2. 配置Nginx反向代理
修改``/etc/nginx/nginx.conf``文件如下：
```text
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log;
pid /run/nginx.pid;

# Load dynamic modules. See /usr/share/doc/nginx/README.dynamic.
include /usr/share/nginx/modules/*.conf;

events {
    worker_connections 1024;
}

### 重点是这一段，配置反向代理，将请求转发给三个control plane实现负载均衡
stream {
	log_format main '$remote_addr $upstream_addr - [$time_local] $status $upstream_bytes_sent';
	access_log /var/log/nginx/k8s-access.log main;

	upstream kubernetes-apiserver {
		server 192.168.100.8:6443 weight=5 max_fails=3 fail_timeout=30s;
		server 192.168.100.11:6443 weight=5 max_fails=3 fail_timeout=30s;
    server 192.168.100.12:6443 weight=5 max_fails=3 fail_timeout=30s;
	}

	server {
    # listen可以选择任意没被占用的端口
		listen 16443;
    # proxy_pass将请求转发到上面upstream中定义的server池
		proxy_pass kubernetes-apiserver;
	}
}
###
### 下面是默认配置，没有修改
http {
      ...
    }
```
## 3. 配置Nginx健康检查
创建文件``/etc/nginx/conf.d/health.conf``:
```text
server {
    listen 20080;
    location /health {
        default_type text/plain;
        return 200 'ok';
    }
}
```
这样，当 ``curl 127.0.0.1:20080``失败时可以执行重启Nginx服务或者漂移动作

## 4. 配置keepalived
1. 修改``/etc/keepalived/keepalived.conf``文件如下
```text
global_defs {
  # 本节点在 VRRP 集群中的唯一标识名，主节点用 NGINX_MASTER；备用节点需要改为 NGINX_BACKUP
	router_id NGINX_MASTER 
}
# 健康检查脚本
vrrp_script check_nginx {
	script "/etc/keepalived/check_nginx.sh"
  interval 3       # 健康检查间隔
  timeout 2        # 脚本超时时间，超过2秒视为失败
  fall 3           # 连续失败3次才认定为不健康
  rise 2           # 连续成功2次才认定为恢复健康
  weight -10       # 检查失败时本节点优先级降低10
}
vrrp_instance VI_1 {
  # 节点的初始角色，主节点用 MASTER；备用节点需要将此配置改为 BACKUP
	state MASTER
  # VVIP 绑定的网卡
	interface eth0
  # VRRP 组的唯一标识，同一组的主备节点必须相同
	virtual_router_id 51
  # 优先级，谁高谁当Master，需要将备用节点的priority设置低于主节点
	priority 100
  # MASTER 每隔多少秒向组播地址发送一次心跳，BACKUP 节点如果超过这个时间没收到心跳，就认为 MASTER 挂了并发起竞选
	advert_int 1
  # 主备节点之间通信的认证方式，防止局域网内其他机器伪造 VRRP 报文
  # PASS是明文传输，安全性较低，生产环境建议用 AH
	authentication {
		auth_type PASS
		auth_pass 1111
	}
  # 虚拟IP地址，此地址必须是网络中没有被占用的
	virtual_ipaddress {
		192.168.100.211/24
	}
  # 引用健康检查
	track_script {
		check_nginx
	}
}
```
2. 主副节点配置差异

|| router_id | state | priority |
| :----: | :----: |:----:|:----:|
| 主     | NGINX_MASTER | MASTER | 100 |
| 副1    | NGINX_BACKUP | BACKUP | 90|
| 副2    | NGINX_BACKUP | BACKUP | 80|

3. 创建``check_nginx.sh``脚本
```shell
#!/bin/bash

http_code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 2 http://127.0.0.1:20080/health)

if [ "$http_code" == "200" ]; then
    exit 0
fi

# 探测失败，尝试重启 nginx
systemctl restart nginx
sleep 2

# 重启后再探测一次，决定返回值给 keepalived 计数
http_code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 2 http://127.0.0.1:20080/health)
if [ "$http_code" == "200" ]; then
    exit 0  # 重启后恢复了，keepalived 不计失败
else
    exit 1  # 重启也没救，keepalived 累计失败次数
fi
```
4. 给脚本增加可执行权限
```bash
chmod +x check_nginx.sh
```

## 5. 重启keepalived和nginx，应用配置
```bash
systemctl restart nginx keepalived
```

# 三、修改原Control Plane，使用VIP作为apiserver入口

## 1. 修改集群配置文件
```bash
kubectl -n kube-system edit cm kubeadm-config
```
修改如下
```yaml
apiVersion: v1
data:
  ClusterConfiguration: |
    apiVersion: kubeadm.k8s.io/v1beta4
    caCertificateValidityPeriod: 87600h0m0s
    certificateValidityPeriod: 8760h0m0s
    certificatesDir: /etc/kubernetes/pki
    clusterName: kubernetes
    controllerManager: {}
    dns: {}
    encryptionAlgorithm: RSA-2048
    etcd:
      local:
        dataDir: /var/lib/etcd
    imageRepository: registry.k8s.io
    kind: ClusterConfiguration
    kubernetesVersion: v1.31.14
    controlPlaneEndpoint: "192.168.100.211:16443"  # 将VIP设置为控制平面入口
    apiServer:
      certSANs:  # 添加 VIP 到证书备用名称（关键！）
      - "192.168.100.8"
      - "192.168.100.11"
      - "192.168.100.12"
      - "192.168.100.211"
      - "kubernetes"
      - "kubernetes.default"
      - "kubernetes.default.svc"
      - "kubernetes.default.svc.cluster.local"
      - "localhost"
      - "127.0.0.1"
    networking:
      dnsDomain: cluster.local
      podSubnet: 10.244.0.0/16
      serviceSubnet: 10.96.0.0/12
    proxy: {}
    scheduler: {}
kind: ConfigMap
metadata:
  creationTimestamp: "2026-03-15T08:07:27Z"
  name: kubeadm-config
  namespace: kube-system
  resourceVersion: "110579"
  uid: 765ac92b-04ba-4ec2-8959-b1d2060f3d3f
```

## 2. 备份原证书
```bash
# 备份
mkdir -p /root/pki-backup
cp -r /etc/kubernetes/pki /root/pki-backup/

# 删除
rm /etc/kubernetes/pki/apiserver.crt -f
rm /etc/kubernetes/pki/apiserver.key -f
```

## 3. 重新生成证书
```bash
kubeadm certs renew apiserver
```

## 4. 修改kubelet.conf和admin.conf文件中apiserver的IP地址
```bash
sed -i 's|192.168.100.8:6443|192.168.100.211:16443|g' /etc/kubernetes/kubelet.conf
sed -i 's|192.168.100.8:6443|192.168.100.211:16443|g' /etc/kubernetes/admin.conf
```

## 5. 重启 kubelet 让新证书和配置生效
```bash
systemctl restart kubelet
```
重启后，kubelet 会自动重建 apiserver pod

## 6. 验证是否能够通过VIP实现健康检查
```bash
curl -k https://192.168.100.211:16443/healthz
```
如果返回OK，则说明网络链路已经没有问题

## 7. 上传证书
```bash
kubeadm init phase upload-certs --upload-certs
```
上传成功后会生成certificate-key，例如:
```text
[root@k8s-master-08 ~]# kubeadm init phase upload-certs --upload-certs
I0321 18:57:15.525254  182649 version.go:261] remote version is much newer: v1.35.3; falling back to: stable-1.31
[upload-certs] Storing the certificates in Secret "kubeadm-certs" in the "kube-system" Namespace
[upload-certs] Using certificate key:
e503a8796c5b9bdf30e84db5eaae520fcbe59fca7e0c833d30e9319931d26e8a
```
需要保存好这个certificate key，这是后面新节点以control plane加入集群的关键凭据

## 8. 生成join命令
```bash
kubeadm token create --print-join-command
```
结果
```text
[root@k8s-master-08 ~]# kubeadm token create --print-join-command
kubeadm join 192.168.100.8:6443 --token bs6bl6.ax3x7vc0n6mydfqx --discovery-token-ca-cert-hash sha256:0b967cdce19efe6a15d6215cd671857624d25230a86809d8ea922495bdba82dd 
```
:::tip
需要注意的是，在control plane上执行生成join命令时，生成的并不一定是以VIP为入口的命令。如果join的IP地址仍然是当前节点的IP，则需要后面在使用时，将IP地址手动修改为VIP。
:::

# 四、新节点加入集群
## 1.加入集群
在新节点上执行
```bash
kubeadm join 192.168.100.211:16443 --control-plane  \
--token bs6bl6.ax3x7vc0n6mydfqx \
--discovery-token-ca-cert-hash sha256:0b967cdce19efe6a15d6215cd671857624d25230a86809d8ea922495bdba82dd \
--certificate-key e503a8796c5b9bdf30e84db5eaae520fcbe59fca7e0c833d30e9319931d26e8a 
```
其中：
- kubeadm join 192.168.100.211:16443 这个IP和端口是我手动修改的；
- --certificate-key 对应刚才 upload-certs 时生成的 certificate key；
- --control-plane 则表示该节点以 control plane 的身份加入集群；
## 2. 为新control plane配置kubeconfig
```bash
mkdir -p $HOME/.kube
cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
chown $(id -u):$(id -g) $HOME/.kube/config
```

# 五、修改全部节点的kubelet配置文件
修改``/etc/kubernetes/kubelet.conf``文件，将server一行的IP地址修改为VIP地址，然后重启kubelet



只有这样，当其中一个control plane宕机时，其他节点才不受影响，否则可能会出现备用control plane可以正常使用kubectl命令，但是节点全都是Not Ready状态的问题。

# 五、测试
## 1. 查看节点
有三个control plane，并且都是Ready
```text
NAME            STATUS   ROLES           AGE    VERSION
k8s-master-08   Ready    control-plane   7d1h   v1.31.14
k8s-master-11   Ready    control-plane   22h    v1.31.14
k8s-master-12   Ready    control-plane   22h    v1.31.14
k8s-node-09     Ready    <none>          7d1h   v1.31.14
k8s-node-10     Ready    <none>          7d1h   v1.31.14
```
## 2. 停止当前VIP所在的节点
可以看见当前VIP绑定在192.168.100.8节点上
![1.png](https://images.white-festa.net/file/posts/ha-kube-apiserver/1774171685819_1.png)
直接``poweroff``这个节点



VIP漂移到了192.168.100.11主机上
![2.png](https://images.white-festa.net/file/posts/ha-kube-apiserver/1774183384047_2.png)

在这个节点上操作集群，查看节点状态
![3.png](https://images.white-festa.net/file/posts/ha-kube-apiserver/1774183481867_3.png)
可以看到k8s-master-08节点虽然宕机，但是另外两个control plane和工作节点仍然可用，因此，这个高可用集群可以说已经成功完成搭建了。

## 六、关于Quorum 选举机制
之后再写