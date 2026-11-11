---
title: Parallels Desktop 虚拟机镜像转换与 Cloud-init NoCloud 初始化实践
published: 2026-11-11
pinned: true
description: 基于 Parallels Desktop 与 Fedora 44，介绍如何制作 Golden Image、转换 QCOW2 虚拟磁盘，并通过 cloud-init NoCloud 数据源与 Seed ISO，实现虚拟机用户、SSH 密钥、主机名及网络配置的自动化初始化。
tags: [cloud-init,kvm,parallels desktop]
category: 虚拟化
draft: false
---

# 一、介绍
本试验基于Parallels Desktop与Fedora-44虚拟机，通过将一个虚拟机设置为模板，并导出为qcow2，为标准化批量部署提供基础。

通过meta-data、user-data和network-config，可以构建出一个seed ISO文件，将此文件挂载到虚拟机上，即可以让虚拟机上的cloud-init读取其中的配置并完成初始化；其原理非常简单。如果你曾经使用过 2000 年代的电脑，通过 DVD 安装过游戏或其他软件，就会发现两者在工作方式上十分相似：安装程序读取光盘中的数据并完成安装，而 cloud-init 则读取 Seed ISO 中的配置数据，完成虚拟机的初始化。区别在于，前者安装的是应用程序，后者配置的是已经安装好的操作系统，而传统的物理光盘也被虚拟化环境中的 ISO 镜像所取代。

通过cloud-init，我们可以实现虚拟机的定制化分发。

# 二、配置Golden image
> Golden Image（金镜像）是经过预先安装、配置与标准化处理的基础系统镜像，通常包含操作系统、必要的软件包以及通用系统配置。通过克隆该镜像并结合 cloud-init 等初始化工具，可以快速生成具有不同主机名、用户账户和网络配置的虚拟机实例。
## 1. 配置环境
在正在运行的fedora-44虚拟机上执行以下操作
```bash
# 安装用于虚拟机初始化的cloud-init
sudo dnf install -y cloud-init
# 启用network-manager和sshd，以便cloud-init可以注入网络配置以及启动后的远程ssh连接
sudo systemctl enable NetworkManager.service sshd.service
```

## 2. 检查环境
检查`/proc/cmdline`
```bash
cat /proc/cmdline
```
若设有 `network: {config: disabled}`、`network-config=disabled` 或 `cloud-init=disabled`，先撤销对应禁用设置。若存在 `/etc/cloud/cloud-init.disabled`，移除该标记。Fedora 的 cloud-init 生成器会在启动时检查数据源。

## 3. 修改cloud-init配置
本次目标使用本地 NoCloud ISO。在模板中写入以下设置，让 cloud-init 用 NetworkManager 生成连接配置。
```bash
sudo tee /etc/cloud/cloud.cfg.d/99-parallels-nocloud.cfg >/dev/null <<'EOF'
datasource_list: [NoCloud]
system_info:
	network:
		renderers: [network-manager]
EOF
```
其中，`datasource_list`为数据源名称，`NoCloud`表示后面要使用的seedISO是本地文件，cloud-init 会读取卷标为 `CIDATA` 的光盘，从根目录取得 `meta-data`、`user-data` 和可选的 `network-config`配置。

除了`NoCloud`之外，还有以下常见的候选值

| 候选值                                   | 从哪里读取配置                          |
| ------------------------------------- | -------------------------------- |
| `NoCloud`                             | 本地 `CIDATA` 配置盘、目录或指定的 URL       |
| `ConfigDrive`                         | OpenStack 风格的配置盘，常用卷标 `config-2` |
| `OpenStack`                           | OpenStack 实例元数据服务                |
| `Ec2`、`Azure`、`GCE`、`AliYun`、`Oracle` | 对应云平台的实例元数据服务                    |
| `VMware`、`OVF`、`LXD`、`MAAS`           | 对应平台或部署工具提供的实例配置                 |
| `None`                                | 兜底数据源，可以读取系统内的配置                 |
## 4. 清除旧实例状态
在分发镜像前，通常需要清除当前虚拟机环境中的现有账号授权和凭据，接着清除旧实例状态并正常关机。此命令会重置本机 ID，并清理 cloud-init 生成的网络配置。执行后直接导出，期间保持虚拟机关闭。
```bash
sudo cloud-init clean --logs --machine-id --seed --configs network && sudo systemctl poweroff
```

# 三、从 PVM 导出 QCOW2
1. `.pvm`文件是Parallels Desktop虚拟机平台的虚拟机包，包裹了真正的磁盘文件（`.hdd`格式）因此在当前模拟环境下需要先将 `.pvm`导出为`qcow2`。
2. 开始操作前确保mac上已经安装了`qemu-img`命令，如果没有可以使用`homebrew`安装

## 1. 准备环境变量
```bash
cat > env.sh << EOF
APP_CLI='/Applications/Parallels Desktop.app/Contents/MacOS'
SOURCE_DISK='/Users/chunyiwang/Parallels/fedora-44-cloudinit.pvm/fedora-44-cloudinit-0.hdd'
LAB="$HOME/Parallels/fedora-44-roundtrip"
DISK_COPY="$LAB/export-source.hdd"
QCOW2="$LAB/fedora-44-aarch64.qcow2"
VDI="$LAB/fedora-44-aarch64.vdi"
RESTORED="$LAB/fedora-44-restored.hdd"
EOF
```
应用环境变量
```bash
source env.sh
```

## 2. 从 PVM 导出 QCOW2
执行以下命令
```bash
(
  set -eu
  test -f "$SOURCE_DISK/DiskDescriptor.xml"
  mkdir "$LAB"
  ditto "$SOURCE_DISK" "$DISK_COPY" # 复制整个 .hdd 包，包括描述文件和磁盘数据。后续合并和转换都作用于这个副本

  descriptor="$DISK_COPY/DiskDescriptor.xml" # 指向副本里的描述文件
  test "$(xmllint --xpath 'count(//Storage)' "$descriptor")" = 1 # 要求只有一个 Storage 区段。这段脚本按单区段磁盘处理。
  image_count=$(xmllint --xpath 'count(//Image)' "$descriptor") # 统计数据层数量。一个 Image 通常是基础盘，多个条目可能包含快照层

  # 在数据层数量大于一时执行合并副本的磁盘快照操作（prl_disk_tool是parallels desktop自带的命令行工具）
  if [ "$image_count" -gt 1 ]; then
    "$APP_CLI/prl_disk_tool" merge --hdd "$DISK_COPY"
  fi
  "$APP_CLI/prl_disk_tool" convert --hdd "$DISK_COPY" --plain # 将磁盘副本转换为 Parallels 的固定容量 Plain 格式。

  test "$(xmllint --xpath 'count(//Image)' "$descriptor")" = 1
  test "$(xmllint --xpath 'string(//Image/Type)' "$descriptor")" = Plain
  raw_file=$(xmllint --xpath 'string(//Image/File)' "$descriptor") # 从 <File> 取出实际的数据文件名，通常是一个 .hds
  test -f "$DISK_COPY/$raw_file"
  qemu-img convert -p -f raw -O qcow2 "$DISK_COPY/$raw_file" "$QCOW2" # 读取裸盘，生成 $QCOW2。`-p` 显示进度
  qemu-img check -f qcow2 "$QCOW2" # 检查 QCOW2 文件自身的结构完整性
  qemu-img info -f qcow2 "$QCOW2" # 显示镜像格式、虚拟容量和宿主机上的实际占用。
)
```
执行后，应该能看到以下内容
```
Operation progress 100 %
    (100.00/100%)
No errors were found on the image.
61254/1048576 = 5.84% allocated, 0.00% fragmented, 0.00% compressed clusters
Image end offset: 4015783936
image: /Users/chunyiwang/Parallels/fedora-44-roundtrip/fedora-44-aarch64.qcow2
file format: qcow2
virtual size: 64 GiB (68719476736 bytes)
disk size: 3.75 GiB
cluster_size: 65536
Format specific information:
    compat: 1.1
    compression type: zlib
    lazy refcounts: false
    refcount bits: 16
    corrupt: false
    extended l2: false
Child node '/file':
    filename: /Users/chunyiwang/Parallels/fedora-44-roundtrip/fedora-44-aarch64.qcow2
    protocol type: file
    file length: 3.74 GiB (4015783936 bytes)
    disk size: 3.75 GiB
```
回到`$LAB`，应该可以看到对应的qcow2文件

# 四、 将 QCOW2 转回 Parallels HDD
假设我们有一个qcow2的云镜像，可以使用以下方式将其转化为Parallels Desktop可读的磁盘格式，执行以下命令：
```bash
(
	set -eu
	test -f "$QCOW2"
	test ! -e "$VDI"
	test ! -e "$RESTORED"
	qemu-img convert -p -f qcow2 -O vdi "$QCOW2" "$VDI"
	"$APP_CLI/prl_convert" "$VDI" --dst="$RESTORED" \
		--stand-alone-disk --allow-no-os --no-reconfig
		
	descriptor="$RESTORED/DiskDescriptor.xml"
	test "$(xmllint --xpath 'count(//Image)' "$descriptor")" = 1
	imported_file=$(xmllint --xpath 'string(//Image/File)' "$descriptor")
	
	case "$(xmllint --xpath 'string(//Image/Type)' "$descriptor")" in
		Compressed) imported_format=parallels ;;
		Plain) imported_format=raw ;;
		*) exit 1 ;;
	esac
	qemu-img compare -f qcow2 -F "$imported_format" \
		"$QCOW2" "$RESTORED/$imported_file"
)
```

# 五、 从导入的 HDD 创建虚拟机
## 1. 配置虚拟机
1. 在 Parallels **控制中心**点右上角 **＋**。选择 **通过映像文件安装 Windows、Linux 或 macOS**，点 **继续**。
2. 若向导列出自动找到的 ISO，点 **手动选择**。勾选左下角 **没有指定源也继续**，点 **继续**，在操作系统列表里选择 **Fedora Linux**。
3. 为 VM 命名，勾选 **安装前自定义设置**（Customize settings before installation），再点 **创建**。安装助手显示 **虚拟机配置** 摘要页后，点击页面中间的 **配置…** 打开硬件设置。摘要页右下角的蓝色 **继续** 会启动虚拟机，留到第 4 节挂好 seed ISO 后再点。
4. 在 **配置 → 硬件**中选中新 VM 自动生成的空硬盘，点 **−** 将它从配置中移除。再点 **＋ → 硬盘 → 现有映像文件**，选择 `~/Parallels/fedora-44-roundtrip/fedora-44-restored.hdd`。若文件选择器展开外层 `.hdd` 包，选择里面同名的 `.hdd`。若能选接口，使用 SATA，与源机一致。
5. 在 **硬件 → 启动顺序**将硬盘放在首位。到 **硬件 → 网络**，将来源设为 **桥接网络**，选择 Mac 实际连接到目标局域网的接口。展开 **高级**，记下新 VM 的 MAC 地址。
6. 保留安装助手窗口，可以切换到终端生成 seed ISO，再回到同一个配置窗口。

## 2. cloud-init注入配置
配置以下环境变量用来存储cloud-init配置
```bash
LAB="$HOME/Parallels/fedora-44-roundtrip"
SEED_DIR="$LAB/seed"
SEED_ISO="$LAB/seed.iso"
mkdir -p "$SEED_DIR"
```

### 创建 meta-data
```bash
cat > "$SEED_DIR/meta-data" <<EOF
instance-id: iid-$(uuidgen | tr '[:upper:]' '[:lower:]')
local-hostname: fedora-44-seeded
EOF
```
其中
- `instance-id`让`cloud-init`判断本次启动是否属于一个新实例，如果`instance-id`不变，不会执行配置注入
- `local-hostname`是虚拟机的主机名，可以自定义

### 创建 user-data
```bash
cat > "$SEED_DIR/user-data" <<EOF
#cloud-config
preserve_hostname: false
users:
  - name: boot
    shell: /bin/bash
    lock_passwd: false
	hashed_password: '$6$goqKmCvcspAXZsI6$Ds0m/g3BK.HBuP6lduUBJZga2nQAKjeMu8q5sPxYkKGxdRxF/u5hTzQ2RZ1ClXb0eN9LEORrMyqqZp6KeyjBz/'
    sudo: "ALL=(ALL:ALL) NOPASSWD: ALL"
    ssh_authorized_keys:
      - "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIL9f5JdRWlR9wBRvpvAUfJhCWWyRai8E7aiY9mYfC/3X localuser@192.168.1.6"
```
在`users`中：
- 创建了新的用户boot
- `shell`：登录成功后启动 Bash
- `lock_passwd`：解除密码锁定
- `hashed_password`：修改此用户的密码（可以使用`openssl passwd -6`命令，输入要设置的密码后获取哈希值）
- `sudo`：设置此用户为 sudoer
- `ssh_authorized_keys`：将一个或多个公钥注入到此用户的家目录下，允许远程免密码登陆

### 创建 network-config
以下配置定义了虚拟机的网络配置
```bash
cat > "$SEED_DIR/network-config" <<EOF
version: 1
config:
  - type: physical
    name: enp0s5
    mac_address: "00:1c:42:aa:bb:cc"
    subnets:
      - type: static
        address: 192.0.2.20/24
        gateway: 192.0.2.1
  - type: nameserver
    address:
      - 192.0.2.53
```
这里需要确保`mac_address`的值为小写，`name`为网卡名称。

### 创建 seed ISO
确认三个文件都无扩展名，且 `user-data` 第一行为 `#cloud-config`。将它们打包成卷标为 `CIDATA` 的 ISO。
```bash
hdiutil makehybrid -o "$SEED_ISO" "$SEED_DIR" \
  -iso -joliet -default-volume-name CIDATA
tar -tf "$SEED_ISO"
```

# 六、挂载 seed ISO 并首次启动
1. 回到安装助手，在 **虚拟机配置** 摘要页点 **配置… → 硬件 → CD/DVD**。将来源设为 **映像文件**，选择 `~/Parallels/fedora-44-roundtrip/seed.iso`，勾选 **已连接**。如果没有光驱，先点 **＋ → CD/DVD** 添加。
2. 确认导入的系统盘已挂载，且启动顺序里硬盘排在首位。关掉**硬件设置子窗口**，回到 **虚拟机配置** 摘要页，再点右下角蓝色 **继续**完成向导并首次启动。
3. 首次启动完成后，应该能在控制台上看到公钥注入的提示
![cloud-init.png](https://images.white-festa.net/file/posts/cloud-init/1794385782060_cloud-init.png)

# 七、验收
在 Fedora 控制台检查以下结果。随后从 Mac 使用对应私钥连接，验证公钥注入。
```bash
cloud-init status --wait --long
cloud-id
hostnamectl --static
ip -4 -brief address
ip -4 route
```