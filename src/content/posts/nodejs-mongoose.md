---
title: Nodejs使用Mongoose对MongoDB进行增删改查等基本操作
published: 2022-09-22
pinned: false
description: 使用Mongoose模块对MongoDB记录进行基本的增删改查操作和筛选，排序等。
tags: [Node, MongoDB]
category: Coding
draft: false
---

## 链接数据库
``` js
//导入Mongoose包
const mongoose = require('mongoose');
//链接MongoDB
mongoose.connect('mongodb://localhost:27017/bilibili');

//设置回调
mongoose.connection.once('open', () => {
    console.log('链接数据库成功');
});
mongoose.connection.once('error', () => {
    console.log('链接数据库失败');
});
mongoose.connection.once('close', () => {
    console.log('和数据库的链接中断');
});
setTimeout(() => {
    mongoose.disconnect();
}, 2000);
```
once和on的区别在于once只会执行一次回调函数，而on会每次都执行，如果将端口侦听写在回调中，则一定要用once。

## 创建新文档
``` js
mongoose.connection.once('open', () => {
    console.log('链接数据库成功');
    //创建文档的结构对象，设置集合中文档的属性以及属性值类型
    let bookSchema = new mongoose.Schema({
        name: String,
        author: String,
        price: Number
    });

    //创建模型对象，即对之前的文档操作的封装对象
    let bookModel = mongoose.model('books', bookSchema);
    //新增
    createBook(bookModel);
    //bookModel.create({name: '西游记', author: '吴承恩',price: 19.9});
});
```
异步执行写入操作，返回插入数据对象本身。
这里原本可以卸载create的回调函数中，但是从Mongoose7开始create方法不在支持回调函数，因此只能通过异步操作方式获得返回对象。
``` js
async function createBook(bookModel){
    try{
        const data = await bookModel.create({ name: '红楼梦', author: '曹雪芹', price: 19.9 });
        console.log(data);
    }catch (err){
        console.log(err);
    }
} 
```
## 字段类型
有以下的数据类型
|类型|描述|
|:----:|:----:|
|String|字符串|
|Number|数字|
|Boolean|布尔值|
|Array|数组类型，也可以用[]表示|
|Date|日期|
|Buffer|Buffer对象，比如多媒体文件的二进制码|
|Mixed|任意类型，需要使用mongoose.Schema.Types.Mixed指定|
|ObjectId|对象ID，需要使用mongoose.Schema.Types.ObjectId指定|
|Decimal128|高精度数字，需要使用mongoose.Schema.Types.Decimal128指定|

#### 举例
```js 
mongoose.connection.once('open', () => {
    let bookSchema = new mongoose.Schema({
        name: String,
        author: String,
        price: Number,
        isHot: Boolean,
        tags: Array,
        publish: Date
    });
    let bookModel = mongoose.model('books', bookSchema);
    createBook(bookModel);
});
async function createBook(bookModel){
    const data = await bookModel.create({ name: '红楼梦', author: '曹雪芹', price: 19.9, isHot: true, tags: ['古典', '社会', '情感'], publish: new Date() });
}
```

## 字段验证
有以下几种验证方法
|类型|作用|
|:----:|:----:|
|required|表示该字段为必填字段|
|unique|是否为唯一值(必须在新集合中实现)|
|enum|枚举类型，复赋值是必须为枚举类型中所规定的值|
|default|字段的默认值|
#### 举例
``` js
mongoose.connection.once('open', () => {
    let bookSchema = new mongoose.Schema({
        id: {type: String, unique: true}, //unique: 是否为唯一值(必须在新集合中实现)
        name: {type: String, required: true}, //required: 表示该字段为必填字段
        author: {type: String, default: 佚名}, //default: 字段的默认值
        source: {type: String, enum: ['中文', '外文']}, //enum: 枚举类型，复赋值是必须为枚举类型中所规定的值。
        price: Number
    });
    let bookModel = mongoose.model('books', bookSchema);
    createBook(bookModel);
});
```
## 删除文档
基于两个核心方法deleteOne和deleteMany可以分别删除单条文档和多条文档
``` js
mongoose.connection.once('open', () => {
    console.log('链接数据库成功');
    let bookSchema = new mongoose.Schema({
        name: String,
        author: String,
        price: Number,
        is_hot: Boolean
    });
    let bookModel = mongoose.model('novels', bookSchema);
    //删除单条
    deleteRecords(bookModel, {author: '余华'}, bookModel.deleteOne);
    //删除多条
    deleteRecords(bookModel, {author: '余华'}, bookModel.deleteMany);
});
async function deleteRecords(model, query, deleteFunction){
    try{
        const data = await deleteFunction.call(model, query);
        console.log(data);
    }catch(err){
        console.log(err);
    }
}
```
## 更新文档
基于updateOne和updateMany两个函数
``` js
mongoose.connection.once('open', () => {
    console.log('链接数据库成功');
    let bookSchema = new mongoose.Schema({
        name: String,
        author: String,
        price: Number,
        is_hot: Boolean
    });
    let bookModel = mongoose.model('novel', bookSchema);
    updateRecords(bookModel, {name: '西游记'}, bookModel.updateOne, {price: 50});
});
async function updateRecords(model, query, update, newRecord){
    try{
        const data = await update.call(model, query, newRecord);
        console.log(data);
    }catch(err){
        console.log(err);
    }
}
```
## 读取文档
同样，基于One和Many两个函数
``` js
async function findRecords(model, query, search){
    try{
        const data = await search.call(model, query);
        console.log(data);
    }catch(err){
        console.log('读取失败: ', err);
        return;
    }
}
```
调用
``` js
findRecords(bookModel, {author: '曹雪芹'}, bookModel.findOne);
findRecords(bookModel, {author: '余华'}, bookModel.findMany);
```

## 条件控制
就像if else可以通过与和或将多个条件结合使用一样，mongodb也可以；MongoDB中有以下几种条件控制
### 运算符
|运算符|作用|
|:----:|:----:|
|$gt|大于|
|$lt|小于|
|$gte|大于等于|
|$lte|小于等于|
|$ne|不等于|

举例：
``` js
findRecords(bookModel, {price: {$lt: 20}}, bookModel.findOne);
```
### 逻辑运算
|运算符|作用|
|:----:|:----:|
|$or|或运算|
|$and|与运算|

举例：
``` js
findRecords(bookModel, {
    $and: [
        {price: {$gt: 30}}, 
        {price: {$lt: 70}}
    ]
}, bookModel.findOne);
```
### 正则匹配
有两种方法
``` js
findRecords(bookModel,{name: /三/}, bookModel.findOne);
//另一种方法：
findRecords(bookModel,{name: new RegExp('三')}, bookModel.findOne);
```
推荐使用第二种，因为第一种无法读取变量。

## 个性化读取
有以下几种方法，可以显示特定的文档
|方法|作用|
|:----:|:----:|
|select|字段筛选|
|sort|排序|
|skip|跳过多少条记录|
|limit|向后显示多少条记录|

使用方法：
``` js
//只显示返回的数据的name和author两个字段, 不显示_id字段
const data = await model.find(query).select({name: 1, author: 1, _id: 0});
//根据返回数据的price字段升序显示(-1为降序)
const data = await model.find(query).sort({price: 1}).select({name: 1, price: 1});
//只返回数据的前三条
const data = await model.find(query).sort({price: 1}).select({name: 1, price: 1}).limit(3);
//和skip组合使用
//只返回第3到第6条数据
const data = await model.find(query).sort({price: 1}).select({name: 1, price: 1}).skip(3).limit(3);
```
