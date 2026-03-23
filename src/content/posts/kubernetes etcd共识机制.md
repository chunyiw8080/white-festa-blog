---
title: "深入 etcd：Raft 共识协议中的选举机制: 角色、Quorum 与 Pre-Vote"
published: 2026-03-23
pinned: true
description: 从节点角色、Quorum 公式、选举流程、split vote 处理，到 Pre-Vote 预投票机制，系统梳理 etcd 在主节点宕机场景下的完整共识过程
tags: [Kubernetes]
category: 容器
draft: false
---


在分布式系统中，多个节点如何就同一份数据达成一致，是一个核心挑战。etcd 采用 Raft 协议来解决这一问题——通过选举出唯一的 Leader 节点来统一处理写入，再将日志同步给其他节点，从而保证集群数据的强一致性。相比早期的 Paxos 协议，Raft 的设计目标之一就是"可理解性"，将共识过程拆解为Leader选举、日志复制、安全性三个相对独立的子问题。


在 Kubernetes 中，etcd 承载着整个集群的状态数据，其选举机制的稳定性直接影响控制面的可用性。本文将从节点角色出发，逐步拆解 etcd 的选举流程、Quorum 机制，以及 Pre-Vote 优化机制。

# 一、etcd节点身份
etcd中每个节点有Leader、Follower和Candidate三种身份
## 1. Raft 三种角色对比
| 维度               | Leader                                | Follower                          | Candidate                          |
| ---------------- | ------------------------------------- | --------------------------------- | ---------------------------------- |
| **角色定位**         | 集群唯一领导者                               | 被动同步节点                            | 竞选中的节点                             |
| **数量**           | 只能有 1 个                               | 0 ~ N-1 个                         | 可能多个（选举期间）                         |
| **是否处理写请求**      |  是（唯一入口）                             |  否（转发或拒绝）                        |  否                                |
| **是否处理读请求**      |  是（强一致读）                             |  可读（可能需走 leader）                |  否                                |
| **核心职责**         | - 接收写请求<br>- 日志复制<br>- 提交事务<br>- 发送心跳 | - 接收日志<br>- 同步数据<br>- 响应 leader   | - 发起选举<br>- 拉票（RequestVote）        |
| **是否主动发消息**      |  是（心跳 + 日志复制）                        |  否（只响应）                          |  是（请求投票）                          |
| **是否参与投票**       | （已经是 leader）                         |  会投票                             |  会投票（给自己）                         |
| **状态触发条件**       | 赢得选举                                  | 默认状态                              | leader 超时未响应                       |
| **状态退出条件**       | - 被更高 term 节点取代<br>- 网络隔离             | - 收到 leader 心跳<br>- 超时变 candidate | - 赢得选举 → leader<br>- 失败 → follower |
| **是否维护 term**    |  是                                   |  是                               |  是（会递增）                           |
| **日志要求**         | 必须是最新的                                | 跟随 leader                         | 必须不落后才能赢                           |
| **典型行为日志（etcd）** | became leader`                      | became follower                | became candidate                 |
| **风险点（生产）**      | - leader 抖动<br>- 负载过高                 | - 落后过多<br>- 同步慢                   | - 频繁选举（异常）                         |
## 2.状态流转图
```text
Follower --(超时)--> Candidate --(赢得选举)--> Leader
    ↑                    ↓
    └------(收到心跳)-----┘
```
# 二、Quorum
quorum 是一个定义了多数票数的指标，例如，在一个三主集群(三个etcd实例)中，当选举发生时，任何一个节点率先拿到2票，则成为leader。
## 1. Quorum计算公式
```text
quorum = floor(N/2) + 1
```
其中：
- N表示etcd节点数量
- floor(N/2)表示 n除以2并向下取整
## 2. 选举流程
以一个三主集群为例：
1. 当某个Follower在指定时间内没有接受到Leader的心跳时，触发选举；
2. ``term + 1`` (term是一个用于维护选举届数的参数，只增不减，每轮term的每个节点只能投票一次)；
3. 发起选举的Candidate为自己投票；
4. 向其他节点发送 ``RequestVote``；
5. 其他节点检查Candidate的日志进度，看是否落后于自己，如果进度相同或者进度超过自己，则投票给此Candidate；
6. 如果Candidate的进度落后于自身，该节点仍然保持Follower身份，并拒绝为Candidate投票，此时视为此轮选举失败；
7. 基于``新的election timeout``，两个存活节点的Candidate转变的先后顺序可能发生转变，理想情况下，可能进度更新的节点会先变为Candidate，然后另一个节点重复步骤5，发现Candidate的进度更高，并投票给Candidate，此时Candidate获得2票，而三主集群中，quorum=2，因此Candidate成为新的Leader，执行写入操作。

### 分票（split vote）场景
``split vote``即多个节点同时为自己投票，一般出现在多个节点的election timeout值非常接近时，此轮选举会被视为失败。

## 3. 关于election timeout
election timeout会在Follower每次接收到Leader心跳时设置，一般是``150ms - 300ms``区间的随机值，当Leader Down时，会利用最后接收到的timeout值，在超时后发起选举。



在一轮选举失败时，所有的Candidate也会获得一个新的election timeout；
### 关于 <连续多轮由进度落后的节点先timeout> 的概率问题
如果集群中当前节点的存活数量为2，假设进度领先的节点为A，进度落后的节点为B,那么：
```text
每轮 Node B 先 timeout 的概率 ≈ 0.5
连续 2 轮：0.5² = 25%
连续 3 轮：0.5³ = 12.5%
连续 10 轮：0.5¹⁰ ≈ 0.1%
```
概率随轮数增加指数级下降，实际上极少超过2-3轮，而由于election timeout的最大值为300ms，在最不理想情况下，三轮选举的时间可能也只需要1000ms(考虑到网络波动因素)

# 三、旧 Leader 回归的处理逻辑
可以分成两种情况考虑
## 1. 某个Follower已经转变为Candidate并执行 term + 1 操作
此时原Leader发现Candidate term大于自己，会立刻：
- 更新 term = 6
- 降级为 Follower
- 立即重新初始化一个随机 election timeout，并开始计时 - 不依赖任何心跳触发

## 2. 还没有任何一个Follower发起选举
旧 Leader 的 term 未过期时，直接续任



所有Follower会收到心跳，重置election timeout，并继续当Follower

# 四、Pre-Vote 机制
Pre-Vote（预投票）是Raft算法中一个用于减少无效选举、避免term无意义增长的优化机制


简单来说，Pre-Vote是某个Follower在丢失心跳后，转变为Candidate前，先向集群中其他节点征求意见的行为。


假设有一个13节点的集群，则quorum为7，Pre-Vote的流程为：
1. 节点 A 丢失心跳，在转变为 Candidate 之前，先向其他节点广播 Pre-Vote 请求，
   询问"如果我发起投票，你是否会选我"。此阶段不递增 term。

2. 其他节点收到请求后，若仍能收到 Leader 心跳，或节点 A 的日志进度落后于自己，
   则拒绝；否则同意。

3. 节点 A 收集响应：
   - 同意数 >= quorum，正式发起选举（此时才递增 term）
   - 已收到的拒绝票数 > N - quorum（即剩余全部同意也无法达到 quorum），
     立即终止，继续保持 Follower 身份