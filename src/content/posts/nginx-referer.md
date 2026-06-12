---
title: 基于Nginx虚拟主机设置资源防盗链的简单方法
published: 2022-09-22
pinned: false
tags: [Nginx]
category: Linux软件部署及使用
draft: false
---

基于nginx的 valid_referer变量可以实现这一功能。<br>
referer是http协议request header中的一个字段，这个字段可以简单的理解为“经手人”，当我们访问某个网站时，我们向这个网站的nginx web server发起了请求，请求解析完成后 nginx会将各种资源和源代码返回给客户端并进行渲染，因此，我们访问的网站可以被视为是我们访问这些静态文件的“经手人”。通过对referer进行限制，可以防止第三方对于资源的获取。<br>

以下代码是一个例子：

``` nginx
valid_referers *.example.com; 
#定义了合法的referer，二级域名为example.com的所有网站都是合法的referer 
if ($invalid_referer) #如果referer不合法，则 invalid_referer为1 
{ 
    return 403; #返回403代码 - 无权限访问 
} 
alias /www/wordpress/resources/image/;
```

使用这种方法，所有非指定的referer的访问都会被拒绝，因此，如果用户只是想保存一张图片，仍会收到403错误代码；

下面是另一种方法：

``` nginx
valid_referers none blocked *.example.com; #当referer为空或referer为指定的二级域名时， invalid_referer为0 
referer if ($invalid_referer) { #如果referer不合法，则 invalid_referer为1 
    return 403; #返回403代码 - 无权限访问 
} 
alias /www/wordpress/resources/image/;
```

none表示空的referer，也就是直接访问，比如直接在浏览器打开一个文件;<br>
blocked表示被防火墙标记过的来路，*..com表示所有子域名。<br>

然而这种方法又存在另外一个缺陷，那就是由于空referer被视为合法，第三方可以通过隐藏referer来实现对资源的盗取。

综上所述，这两种方法都存在缺陷，最好的方法还是通过设置CDN来限制IP来源。

但是既然你已经用了这种方法了，说明你的网站大概率不是什么热门站点。。大概率不会受到那么多资源窃取，因此也不必太过担心。
