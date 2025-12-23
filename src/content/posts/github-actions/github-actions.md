---
title: 使用GitHub Actions实现CI/CD流水线
published: 2025-03-29
pinned: false
description: 使用GitHub Actions一键将应用程序部署至Azure Kubernetes
tags: [GitHub Actions]
category: DevOps
draft: false
---

# 使用GitHub Actions实现CI/CD流水线

GitHub Actions 是 GitHub 提供的一个强大而灵活的自动化工具，能够帮助开发者实现持续集成（CI）和持续交付/部署（CD）流水线。它能够让开发者在代码库的不同阶段（如代码提交、拉取请求、发布等）自动触发构建、测试、部署等任务。借助 GitHub Actions，开发者可以通过自定义的 YAML 文件定义工作流，实现从代码提交到应用发布的全自动化过程。  

## GitHub Actions的优势
- 深度集成：GitHub Actions 与 GitHub 仓库无缝集成，可以根据事件自动触发工作流，适用于各类开发项目。
- 灵活性高：支持高度自定义的工作流，开发者可以根据不同的项目需求，灵活地配置不同的任务、条件和依赖
- 生态系统丰富：GitHub Marketplace 提供了数千个现成的 Actions（如容器部署、测试工具、CI/CD 任务等），开发者可以方便地复用已有组件，减少重复工作。
- 并行化任务执行：GitHub Actions 可以让多个任务并行运行，提升 CI/CD 的效率，适应大型项目的复杂需求。
- 可扩展性强: GitHub actions可以与主流云计算平台相结合，实现无缝的云部署。  

## 实践：通过GitHub Actions实现自动化构建docker镜像并部署到Azure Kubernetes上

项目链接：https://github.com/chunyiw8080/sit722-part5  

## 使用Terraform创建Azure Kubernetes集群和Container Registry镜像存储库

## 编写Shell脚本
GitHub Actions会使用Linux环境执行Workflow中的操作，因此将所有涉及到的命令拆分为多个Shell脚本效率更高，也更便于修改。  

### 构建镜像脚本
``` bash
set -u
: $CONTAINER_REGISTRY
: $VERSION

docker build -t $CONTAINER_REGISTRY/book-catalog:$VERSION --file ./book_catalog/Dockerfile .
docker build -t $CONTAINER_REGISTRY/inventory:$VERSION --file ./inventory_management/Dockerfile .
```
### 推送镜像脚本
``` bash
set -u
: "$CONTAINER_REGISTRY"
: "$VERSION"
: "$REGISTRY_UN"
: "$REGISTRY_PW"

echo $REGISTRY_PW | docker login $CONTAINER_REGISTRY --username $REGISTRY_UN --password-stdin
docker push $CONTAINER_REGISTRY/book-catalog:$VERSION
docker push $CONTAINER_REGISTRY/inventory:$VERSION
```

### 部署脚本
```bash
set -u
: "$CONTAINER_REGISTRY"
: "$VERSION"
: "$DB_URL"

envsubst < ./scripts/kubernetes/configmap.yaml | kubectl apply -f -
envsubst < ./scripts/kubernetes/service.yaml | kubectl apply -f -
envsubst < ./scripts/kubernetes/deployment.yaml | kubectl apply -f -
```
其中``envsubst``命令能将后面文件中的环境变量占位符替换为当前环境中的实际值。  

### 删除脚本
```bash
set -u
: "$CONTAINER_REGISTRY"
: "$VERSION"
: "$DB_URL"

envsubst < ./scripts/kubernetes/deployment.yaml | kubectl delete -f -
envsubst < ./scripts/kubernetes/service.yaml | kubectl delete -f -
envsubst < ./scripts/kubernetes/configmap.yaml | kubectl delete -f -
```

## 编写GitHub workflow配置
### Deploy Microservice yaml
``` yaml
name: Deploy microservice

# 仅限手动构建，如果使用branches关键字，可以指定当代码被推送到对应分支是触发自动构建
on:
  workflow_dispatch:

# 将要运行的任务
jobs:
  deploy:
    # 任务运行环境
    runs-on: ubuntu-latest
    # 环境变量，这些变量在仓库的secrets中声明和配置
    env:
      VERSION: ${{ github.sha }}
      CONTAINER_REGISTRY: ${{ secrets.CONTAINER_REGISTRY }}
      REGISTRY_UN: ${{ secrets.REGISTRY_UN }}
      REGISTRY_PW: ${{ secrets.REGISTRY_PW  }}
      DB_URL: ${{ secrets.DB_URL }}
    # 具体的任务步骤
    steps:
        # actions/checkout：GitHub 官方提供的一个标准 Action，用来将代码库的当前版本拉取到虚拟机或容器中。
      - uses: actions/checkout@v3
      - name: Build images
        run: bash ./scripts/build-image.sh
      - name: Push image
        run: bash ./scripts/push-image.sh
        # tale/kubectl-action：一个第三方 Action，用于在 GitHub Actions 工作流中执行 kubectl 命令，管理 Kubernetes 集群
      - uses: tale/kubectl-action@v1
        with:
          # 经过 base64 编码的 Kubernetes 配置文件
          base64-kube-config: ${{ secrets.KUBE_CONFIG }}
          # 指定 kubectl 的版本号
          kubectl-version: v1.30.3
      - name: Deploy
        run: bash ./scripts/deploy.sh
```
### Delete Microservice yaml
和Deploy差不多，只不过在关键的地方使用``delete.sh``脚本触发kubectl delete操作。
``` yaml
name: Delete microservice

on:
  workflow_dispatch: 

jobs:

  deploy:
    runs-on: ubuntu-latest
    
    env:
      VERSION: ${{ github.sha }}
      CONTAINER_REGISTRY: ${{ secrets.CONTAINER_REGISTRY }}
      REGISTRY_UN: ${{ secrets.REGISTRY_UN }}
      REGISTRY_PW: ${{ secrets.REGISTRY_PW  }}
      DB_URL: ${{ secrets.DB_URL }}

    steps:
      - uses: actions/checkout@v3
      - uses: tale/kubectl-action@v1
        with:
          base64-kube-config: ${{ secrets.KUBE_CONFIG }}
          kubectl-version: v1.30.3
      - name: delete
        run: ./scripts/delete.sh
```
## 在仓库的secrets中声明和配置变量  

### CONTAINER_REGISTRY，REGISTRY_UN和REGISTRY_PW
这三个变量是镜像存储库Server name以及其用户名和密码，在之前我已经通过Terraform创建好了存储库，因此可以在Azure Container Registry中的Access Key中查看  

### KUBE_CONFIG
该变量是经过``base64``编码的Kubernetes配置文件，通过这个编码，github可以将本地仓库中的kubernetes配置文件部署到kubernetes集群中，这个编码其实就相当于Kubernetes集群的通行证。
要想获得通行证，首先需要在本地将要使用的集群设定为当前上下文。
1. 使用Azure-cli登录
2. 将Kubernetes集群设置为当前kubectl上下文
```bash
az aks get-credentials --resource-group <RESOURCE_GROUP_NAME> --name <CLUSTER_NAME>
```
3. 生成Base64编码
``` bash
cat ~/.kube/config | base64
```
4. 将生成的编码复制粘贴到GitHub secrets中。  

### DB_URL
该变量是要使用的数据库链接，本项目使用免费的Render PostgreSQL数据库。

### VERSION
该变量是镜像版本，由于一个项目可能会经历多次构建和提交，因此使用硬编码是不可行的。``github.sha``会获取当前运行的Git提交的完整SHA值，这通常用于生成唯一的版本号或标记。通过这种方式，构建的镜像可以基于每次提交自动生成唯一的标记。

## 触发构建
在GitHub仓库中点击``Actions``,在workflow中找到``Deploy microservice``，然后点击``Run workflow``就可以触发构建。  
如果一切无误，结果应该是这样的：

当右上角出现对号图标，意味着构建成功。  
值得注意的是，GitHub Actions构建成功不一定代表部署成功，比如如果Kubernetes配置文件中存在错误，除非是会导致``exit code 1``的语法错误，否则是不会提示错误的。

同理，要想删除部署，只需要点击``Delete microservice``并运行构建。



