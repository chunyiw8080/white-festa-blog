---
title: 使用Terraform部署Azure资源
published: 2024-07-15
pinned: false
description: 使用Terraform部署Azure Kubernetes和Container Regsitry
tags: [Terraform, Azure]
category: DevOps
draft: false
---

# 使用Terraform部署Azure Kubernetes和Container Regsitry
基础设施即代码（Infrastructure as Code，简称 IaC）是一种通过代码管理和自动化部署基础设施的方法。随着云计算的发展，手动配置和管理资源的复杂性与日俱增，IaC 通过将基础设施的配置与应用代码一样进行版本控制和自动化部署，大大提高了部署效率、可靠性和可重复性。  
Terraform是目前最流行的 IaC 工具之一，它能通过定义“计划文件”来描述云资源，用户可以用它来管理各种基础设施，包括虚拟机、网络、存储、容器服务等。它的优势在于对多种云平台的支持，无论是 AWS、Azure、Google Cloud，还是本地的私有云，Terraform 都能够帮助用户自动化部署复杂的云环境。  
本文将讨论如何使用 Terraform 在 Azure 平台上自动化部署 Kubernetes 集群和镜像存储库（如 Azure Container Registry）。通过将 Terraform 与 Azure 云平台结合，可以轻松实现 Kubernetes 集群的自动化管理、镜像的集中存储与管理，以及其他 Azure 资源的可重复创建和管理。

## 编写Terraform脚本
### 定义Provider
Provider 是 Terraform 连接并操作各种基础设施平台（如云服务、SaaS 应用程序或自定义 API）的组件。它提供了 Terraform 访问这些平台的资源接口，从而允许用户通过 Terraform 配置和管理这些资源。每个 provider 都支持多个具体资源（resource），比如虚拟机、存储桶、数据库等。
```hcl
terraform { # Terraform全局配置
    required_providers {
        azurerm = {
            source = "hashicorp/azurerm" # Provider来源地址
            version = "~> 3.71.0" # Provider的版本要求，~> 表示兼容性符号，即允许使用 3.71.x 系列的任何版本
        }
    }
    required_version = ">= 1.5.6" # Terraform CLI 的最低版本要求
}

provider "azurerm" {
    # features：允许开启或关闭某些 Azure Provider 的功能或特性，此字段是必需的，即使不进行任何配置
    features {}
}
```

### 创建资源组
```hcl
resource "azurerm_resource_group" "deakinuni" {
  name = var.resource_group_name
  location = var.location
}
```
name是资源组名称，location是资源组实例的物理节点位置，他们的值会在后面的``variables.tf``配置文件中设置

### 创建Container Registry
```hcl
resource "azurerm_container_registry" "container_registry" {
  name = var.app_name
  resource_group_name = var.resource_group_name
  location = var.location
  admin_enabled = true # 启用管理员权限
  sku = "Basic" # 服务定价层级(Stock Keeping Unit)，目前使用的是最便宜的Basic级
}
```

### 创建Kubernetes Cluster
```hcl
resource "azurerm_kubernetes_cluster" "kubernetes_cluster" {
  name = var.app_name
  location = var.location
  resource_group_name = var.resource_group_name
  dns_prefix = var.app_name
  kubernetes_version = var.kubernetes_version

  default_node_pool { # 该配置声明节点池的节点数量和节点配置
    name = "default"
    node_count = 1
    vm_size = "standard_B2s"
  }

  identity { # 使用托管身份，由系统自动分配，这样不需要显式地管理凭据。
    type = "SystemAssigned"
  }
}
# 定义Azure角色分配，用于将Azure Container Registry的AcrPull权限分配给Kubernetes集群中的kubelet身份，以便Kubernetes节点能够从容器注册表拉取镜像
resource "azurerm_role_assignment" "role_assignment" {
  # 主体ID，在这里是Kubernetes集群中的kubelet组件
  principal_id = azurerm_kubernetes_cluster.kubernetes_cluster.kubelet_identity[0].object_id

  # 表示角色分配的作用域，即该角色可以访问的资源，在这里是指的是Azure容器注册表的资源ID，即Kubernetes集群的kubelet身份可以访问该容器注册表
  scope = azurerm_container_registry.container_registry.id

  # 分配的权限：AcrPull是一个Azure内置的角色，允许主体从Azure Container Registry中拉取镜像
  role_definition_name = "AcrPull"

  # 跳过Azure Active Directory (AAD) 检查，可以加速角色分配过程
  skip_service_principal_aad_check = true
}
```

### 创建变量配置文件variables.tf
```hcl
variable "resource_group_name" {
  default = "deakinuni"
}

variable "location" {
  default = "australiaeast"
}

variable "app_name" {
    default = "task92c"
}

variable "kubernetes_version" {
    default = "1.30.3"
}
```

## 应用Terraform脚本

### 初始化工作目录
在terraform脚本的目录中执行命令
```bash
terraform init
```
这条命令会根据脚本配置下载必要的Provider插件，如果配置中使用了外部模块也会下载对应的内容。

### 生成并显示基础设施变更计划
```bash
terraform plan
```
该命令帮助用户在应用更改之前，预览 Terraform 配置文件的更改对现有基础设施的影响；此命令不会对基础设置产生实际影响。

### 应用配置
``` bash
terraform apply
```
该命令切实地将terraform配置通过Provider应用到对应的云平台，在不存在语法错误或余额不足等情况下，该命令应该会执行成功。

### 撤销部署
``` bash
terraform destroy
```
该命令会根据脚本文件删除全部的基础设施。