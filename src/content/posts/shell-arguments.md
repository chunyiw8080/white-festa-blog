---
title: Shell脚本像普通命令一样使用选项传递参数
published: 2023-10-07
pinned: false
description: 基于getopts和shift两个命令实现通过选项向Shell脚本传递参数
tags: [Shell]
category: 运维自动化
draft: false
---

Linux上的命令包含各种可选的参数以实现不同的功能，例如很常用的ps -ef可以查看系统进程，ls -l可以查看目录下文件的详细信息；shell脚本也可以实现类似的功能，主要是基于getopts和shift两个命令实现。

## getopts短选项

#### 命令格式
```
getopts optstring name [arg]
```
参数含义：
* optstring：表示要识别的命令行选项形式，如果一个字母后面有一个":"，表示该命令行选项后面要跟一个参数。如optsting写成"co:f:"，表示支持-c、-o、-f选项识别，-o和-f选项后面需要跟一个参数
* name：每次调用它前，getopts都会将下一个选项放置在shell变量$name中，如果传入命令行中不存在name选项，则将其重新初始化
* arg：表示要解析参数，在shell脚本中使用时，默认解析的是执行shell脚本传入的参数，所以这个部分可省略不写
#### 使用方法
以一个脚本为例：该脚本实现了近似find命令的功能，使用-d参数传入目录路径，使用-s参数传入文件后缀名，最后这个脚本递归返回该目录下所有为给定值为后缀的文件路径
``` bash
#!/bin/bash
list_files() {
  local dir="$1"
  local suffix="$2"

  for file in "$dir"/*; do
    if [ -f "$file" ] && [[ "$file" == *".$suffix" ]]; then
      echo "$file"
    elif [ -d "$file" ]; then
      list_files "$file" "$suffix" 
    fi
  done
}
directory=""
suffix=""
while getopts "d:s:h" opt; do
    case $opt in
    d)
        # 将-d后面传入的值赋值给directory变量
        directory="$OPTARG"
        ;;
    s)
        # 将-s后面传入的值赋值给suffix变量
        suffix="$OPTARG"
        ;;
    h)
        # -h 显示用法
        echo "Usage: ./find.sh -d [path] -s [suffix]"
        exit 0
        ;;
    \?)
        echo "Invalid argument: -$OPTARG" >&2
        exit 1
        ;;
    esac
done
if [ -z "$directory" ] || [ -z "$suffix" ]; then
  echo "FATAL: No directory or suffix provided. "
  echo "Try './find.sh -h' for more information"
  exit 1
fi
if [ ! -d "$directory" ]; then
  echo "FATAL: Invalid parameter: $directory does not exists"
  exit 1
fi
list_files "$directory" "$suffix"
```
使用：
``` bash
./find.sh -d /etc -s conf
```

## 长短选项结合使用
getopts只支持短参数，因此如果想使用长参数，例如--help，就不能使用getopts了。只能将选项和实际的参数一起传入。
``` bash
#!/bin/bash
list_files() {
  local dir="$1"
  local suffix="$2"
  for file in "$dir"/*; do
    if [ -f "$file" ] && [[ "$file" == *".$suffix" ]]; then
      echo "$file"
    elif [ -d "$file" ]; then
      list_files "$file" "$suffix"  # 递归调用自身来遍历子目录
    fi
  done
}
directory=""
suffix=""
while [ "$#" -gt 0 ]; do
    case $1 in
    -d)
        directory="$2"
        shift 2
        ;;
    -s)
        suffix="$2"
        shift 2
        ;;
    -h|--help)
        echo "Usage: ./find.sh -d [path] -s [suffix]"
        exit 0
        ;;
    *)
        echo "Invalid argument"
        exit 1
        ;;
    esac
done
if [ -z "$directory" ] || [ -z "$suffix" ]; then
  echo 'No directory and suffix provided. /n Try "./find.sh -h" for more information'
  exit 1
fi
if [ ! -d "$directory" ]; then
  echo "Invalid parameter: $directory"
  echo "Directory does not exists"
  exit 1
fi
list_files "$directory" "$suffix"
```

这种写法shell无法识别那个是选项而那个是参数，因此需要使用到``shift``，shift的主要目的是将命令行参数向左移动，使得程序可以访问到下一个参数。
``shift``的默认偏移量是1，也就是每次处理一个参数，但也可以手动指定，在这个脚本中，因为我们每个选项后面都跟着一个参数，因此将``shift``设置为2来区分选项和参数，并在while循环中，通过判断剩余参数的数量来控制循环的剩余次数。
对于长短选项结合，只要使用``分隔符|``就可以实现。
