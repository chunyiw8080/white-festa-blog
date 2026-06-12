---
title: Python进程与线程
published: 2024-09-30
pinned: false
description: 本文介绍了Python中创建进程和线程的方法，包括使用multiprocessing模块和threading模块，并讲解了进程间及线程间通信的实现。
tags: [Python]
category: Coding
draft: false
---

在Python 中有多个模块可以创建进程，比较常用的有`os.fork()`函数、`multiprocessing` 模块和`pool` 进程池。

`os.fork()`函数只适用于Unix/Linux/Mac 系统上运行，在Windows 操作系统中不可用。

# 使用multiprocessing 模块创建进程
```python
from multiprocessing import Process
import time

def print_hello(txt, interval):
    """方法1：在60秒内每隔2秒打印一次hello"""
    start_time = time.time()
    while time.time() - start_time < 60:  # 运行60秒
        print(txt)
        time.sleep(interval)  # 间隔2秒

def main():
    """主函数：将print_hello包装为单独进程执行"""
    # 创建进程
    p1 = Process(target=print_hello, args=("hello", 2, ))
    p2 = Process(target=print_hello, args=("world", 5, ))

    print("启动子进程...")
    p1.start()  # 启动进程
    p2.start()
    print(f"子进程已启动, p1: {p1.pid}, p2: {p2.pid}")

    # 主进程可以继续做其他事情
    print("主进程继续运行...")

    # 等待子进程结束（可选）
    # p.join()
    print("子进程已结束")

if __name__ == '__main__':
    main()
```

其中，p1 和 p2 是进程的实例化，这两个进程将作为 Python 的子进程被执行。

##  参数
+ `target`: 要执行的函数名
+ `args`: 要执行的函数的所需参数，以元祖的形式

## Process 的常用方法
+ `is_alive()`：判断进程实例是否还在执行。
+ `join([timeout])`：是否等待进程实例执行结束，或等待多少秒。
+ `start()`：启动进程实例（创建子进程）。
+ `run()`：如果没有给定target 参数，对这个对象调用start()方法时，就将执行对象中的run()方法。
+ `terminate()`：不管任务是否完成，立即终止。

## 常用属性
+ `name`：当前进程实例别名，默认未Process-N，N 为从1 开始递增的整数。
+ `pid`：当前进程实例的PID 值。

# 使用进程池 Pool 创建进程
使用`multiprocessing` 模块提供的`Pool` 类，即Pool进程池创建大量进程。

```python
from multiprocessing import Pool
import time
import os

def task(name):
    print('子进程(%s)执行Task %s', (os.getpid(), name))
    time.sleep(2)

if __name__ == '__main__':
    print('父进程(%s). ', os.getpid())
    # 初始化一个包含 4 个工作进程的进程池（最多同时运行 4 个子进程）。
    p = Pool(4)
    # 使用 apply_async 异步提交 10 个任务到进程池。
    # 由于进程池大小为 4，每次最多并行执行 4 个任务，剩余任务会排队等待。
    for i in range(10):
        p.apply_async(task, args=(i,))

    print('等待所有子进程运行结束')
    p.close()
    p.join()
    print('所有子进程运行结束')
```

## 常用方法
+ a`pply_async(func[, args[, kwds]])`：使用非阻塞方式调用func()函数（并行执行，堵塞方式必须等待上一个进程退出才能执行下一个进程），arge为传递给func()函数的参数列表，kwds 为传递给func()函数的关键字参数列表。
+ `apply(func[, args[, kwds]])`：使用阻塞方式调用func()函数。
+ `close()`：关闭Pool，使其不再接受新的任务。
+ `terminate()`：不管任务是否完成，立即终止。
+ `join()`：主进程阻塞，等待子进程的退出，必须在close 或terminate之后使用。

# 进程间通信
##  使用队列 Queue 实现进程间通信
multiprocessing.Queue 是一个线程安全的 FIFO（先进先出）队列，适用于多进程通信。

```python
from multiprocessing import Process, Queue
import time

def write_in_queue(queue):
    for i in range(10):
        if not queue.full():
            txt = "Hello World" + str(i)
            # put放入数据
            queue.put(txt)
            print(f"已写入{txt}")

def read_from_queue(queue):
    while not queue.empty():
        time.sleep(1)
        # get取出数据
        print(f"读取信息：{queue.get()}")

if __name__ == '__main__':
    queue = Queue()
    pw = Process(target=write_in_queue, args=(queue,))
    pr = Process(target=read_from_queue, args=(queue,))
    pw.start()
    pw.join()
    pr.start()
    pr.join()
```

###  常用方法
+ `Queue.qsize()`：返回当前队列包含的消息数量。
+ `Queue.empty()`：如果队列为空，返回True，反之返回False。
+ `Queue.full()`：如果队列满了，返回True，反之返回False。
+ `Queue.get([block[, timeout]])`：获取队列中的一条消息，然后将其从队列中移除，block 默认值为True。
    - 如果block 使用默认值，且没有设置timeout（单位秒），消息队列为空，此时程序将被阻塞（停留在读取状态），直到从消息队列读到消息为止。
    - 如果设置了timeout，则会等待timeout 秒，若还没读取到任何消息，则抛出“`Queue.Empty`”异常。
    - 如果block 值为False，消息队列为空，则会立即抛出“`Queue.Empty`”异常。
    - `Queue.get_nowait()`：相当于`Queue.get(False)`。
+ `Queue.put(item,[block[,timeout]])`：将item 消息写入队列，block默认值为True。
    - 如果block 使用默认值，且没有设置timeout（单位秒），消息队列如果已经没有空间可写入，此时程序将被阻塞（停在写入状态），直到从消息队列腾出空间为止，如果设置了timeout，则会等待timeout 秒，若还没空间，则抛出“`Queue.Full`”异常。
    - 如果block 值为False，消息队列如果已经没有空间可写入，则会抛出“`Queue.Full`”异常。
    - `Queue.put_nowait(item)`：相当于`Queue.put(item, False)`。

###  使用场景
+ Queue 通信适用于生产者-消费者模型（一个进程生产数据，另一个消费数据）。
+ 线程安全，支持多个进程同时访问。

### Queue 本质上是共享内存
multiprocessing.Queue 本质上是基于共享内存的 IPC 机制，但它对共享内存进行了高层封装，使其成为一个 线 程/进程安全的 特殊数据结构（FIFO 队列）。

### Queue 的底层实现
+ 共享内存 + 锁/信号量
    - 数据存储在共享内存中（通常是序列化后的字节流）。
    - 通过 Lock 或 Semaphore 保证多进程/线程安全访问。
+ 管道（Pipe）或套接字（Socket）
    - 在部分实现中，Queue 可能依赖管道或本地套接字（即使是非网络通信）来传递数据，但核心仍然是共享内存的变体。

### Queue 与直接共享内存的区别
| 特性 | multiprocessing.Queue| 直接共享内存 |
| --- | --- | --- |
| <font style="background-color:rgba(255, 255, 255, 0);">数据结构</font> | <font style="background-color:rgba(255, 255, 255, 0);">高级 FIFO 队列</font> | <font style="background-color:rgba(255, 255, 255, 0);">原始数值或数组</font> |
| <font style="background-color:rgba(255, 255, 255, 0);">线程/进程安全</font> | <font style="background-color:rgba(255, 255, 255, 0);">是（内置锁机制）</font> | <font style="background-color:rgba(255, 255, 255, 0);">否（需手动加锁）</font> |
| <font style="background-color:rgba(255, 255, 255, 0);">适用场景</font> | <font style="background-color:rgba(255, 255, 255, 0);">生产者-消费者模型、任务分发</font> | <font style="background-color:rgba(255, 255, 255, 0);">高性能数值计算</font> |
| <font style="background-color:rgba(255, 255, 255, 0);">数据复杂度</font> | <font style="background-color:rgba(255, 255, 255, 0);">支持任意 Python 对象（自动序列化）</font> | <font style="background-color:rgba(255, 255, 255, 0);">仅支持简单类型（int, float, array）</font> |
| <font style="background-color:rgba(255, 255, 255, 0);">底层机制</font> | <font style="background-color:rgba(255, 255, 255, 0);">共享内存 + 锁 + 可能的管道/套接字</font> | <font style="background-color:rgba(255, 255, 255, 0);">纯共享内存</font> |


###  为什么 Queue 更安全？
+ 自动序列化
    - 当你调用` q.put(obj)` 时，obj 会被自动序列化（Pickle）为字节流，再存入共享内存。
    - 而 Value/Array 需要手动管理数据格式（如 'd' 表示双精度浮点数）。
+ 隐式同步
    - Queue 内部使用锁和信号量，确保 `put()` 和 `get()` 不会冲突。
    - 直接共享内存需手动加锁（如` with lock:`）
+ 流量控制
    - Queue 可以设置最大长度（maxsize），当队列满时 `put()` 会阻塞，避免内存爆炸。

# 使用 `threading` 模块创建线程
由于线程是操作系统直接支持的执行单元，因此，高级语言（如Python、Java 等）通常都内置多线程的支持。

Python 的标准库提供了两个模块：`_thread`和`threading`，`_thread` 是低级模块，`threading` 是高级模块，对 `_thread` 进行了封装。绝大多数情况下，我们只需要使用threading 这个高级模块。

`threading` 模块提供了一个`Thread` 类来代表一个线程对象。

## Thread 类语法
`Tread([group [, target [, name [, args [, kwargs]]]])`

参数：

+ `group`：值为None，为以后版本而保留。
+ `target`：表示一个可调用对象，线程启动时，`run()`方法将调用此对象，默认值为None，表示不调用任何内容。
+ `name`：表示当前线程名称，默认创建一个“Thread-N”格式的唯一名称。
+ `args`：表示传递给target()函数的参数元组。
+ `kwargs`：表示传递给target()函数的参数字典。

## 示例
```python
import threading
import time

def processes():
    for i in range(3):
        time.sleep(1)
        print(f"Thread Name: {threading.current_thread().name}\n")

if __name__ == '__main__':
    print("主进程开始执行")
    
    threads = [threading.Thread(target=processes) for i in range(4)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    print("主进程结束")
```

## 重写 Thread 类实现带返回值的线程
```python
import threading

class MyThread(threading.Thread):
    def __init__(self, func, args):
        super(MyThread, self).__init__()

        self.func = func
        self.args = args

    def run(self):
        self.result = self.func(*self.args)

    def get_result(self):
        try:
            return self.result
        except Exception as e:
            return None
```

该类继承了基础的`threading.Thread`类，增加了一个 `result` 属性并重写了 `run()` 方法获取返回值。

`get_result` 方法让数据以只读形式返回

调用

```python
import time

def calculate(a, b):
    time.sleep(10)
    n1 = a + B
    n2 = a * b
    n3 = a / b
    return n1, n2, n3

if __name__ == '__main__':
    t = MyThread(calculate, (1, 2))
    t.start()
    t.join()

    print(t.get_result())
```

# 线程间通信
在 Python 中，线程之间通信比进程间通信更简单，因为 线程共享同一进程的内存空间（全局变量、堆内存等）。但这也带来了 **线程安全**（Thread Safety） 问题，需要通过**同步机制**（如锁、队列）来避免**竞争条件**（Race Condition）。

```python
import threading

# 共享变量
counter = 0
lock = threading.Lock()

def increment():
    global counter
    for _ in range(100000):
        with lock:  # 加锁保证原子操作
            counter += 1

# 创建两个线程
t1 = threading.Thread(target=increment)
t2 = threading.Thread(target=increment)

t1.start()
t2.start()
t1.join()
t2.join()

print("Final counter:", counter)
```

从上面的例子可以得出，在一个进程内的所有线程共享全局变量，能够在不使用其他方式的前提下完成多线程之间的数据共享。

## 互斥锁
互斥锁（Mutual Exclusion Lock，简称 Mutex）是一种 同步机制，用于确保同一时间只有一个线程（或进程）能访问共享资源（如变量、文件、内存等），从而避免 竞争条件（Race Condition） 和数据不一致问题。

###  互斥锁的工作原理
+ 加锁（Lock）：线程在访问共享资源前先获取锁，如果锁已被占用，则阻塞等待。
+ 释放锁（Unlock）：线程完成操作后释放锁，其他线程可以竞争锁。
+ 关键特性：
    - 原子性：锁的获取和释放是原子的（不会被中断）。
    - 独占性：同一时间只有一个线程持有锁。

### 锁的使用
Lock 类有2 个方法：`acquire()`锁定和`release()`释放锁。

#### 显式使用锁
```python
import threading
import time

ticket = 10
lock = threading.Lock()

def task():
    global ticket
    lock.acquire()
    temp = ticket
    time.sleep(2)
    ticket = temp - 1
    if ticket >= 0:
        print(f"购买成功，剩余{ticket}张票, {threading.current_thread().name}")
    else:
        print(f"购买失败，余票不足, {threading.current_thread().name}")
    lock.release()

if __name__ == '__main__':
    t_list = []
    for i in range(11):
        t = threading.Thread(target=task)
        t_list.append(t)
        t.start()
```

#### 使用`with lock:` 上下文管理器语法
使用`with lock:` 上下文管理器语法可以确保锁一定会被释放

```python
import threading
import time

ticket = 10
lock = threading.Lock()

def task():
    global ticket
    with lock:
        temp = ticket
        time.sleep(2)
        ticket = temp - 1
        if ticket >= 0:
            print(f"购买成功，剩余{ticket}张票, {threading.current_thread().name}")
        else:
            print(f"购买失败，余票不足, {threading.current_thread().name}")

if __name__ == '__main__':
    t_list = []
    for i in range(11):
        t = threading.Thread(target=task)
        t_list.append(t)
        t.start()
```

### 多线程死锁
死锁是指多个线程互相等待对方释放锁，导致程序卡死。

#### 常见场景
+ 线程 A 持有锁 L1，等待锁 L2；
+ 线程 B 持有锁 L2，等待锁 L1。

#### 解决方法
+ 按固定顺序获取锁（如总是先拿 L1 再拿 L2）。
+ 使用 `lock.acquire(timeout=2)` 设置超时。

