import type { FriendLink, FriendsPageConfig } from "../types/config";

// 可以在src/content/spec/friends.md中编写友链页面下方的自定义内容

// 友链页面配置
export const friendsPageConfig: FriendsPageConfig = {
	// 页面标题，如果留空则使用 i18n 中的翻译
	title: "",

	// 页面描述文本，如果留空则使用 i18n 中的翻译
	description: "",

	// 是否显示底部自定义内容（friends.mdx 中的内容）
	showCustomContent: true,

	// 是否开启随机排序配置，如果开启，就会忽略权重，构建时进行一次随机排序
	randomizeSort: false,
};

// 友链配置
export const friendsConfig: FriendLink[] = [
	{
		title: "夏夜流萤",
		imgurl: "https://q1.qlogo.cn/g?b=qq&nk=7618557&s=640",
		desc: "飞萤之火自无梦的长夜亮起，绽放在终竟的明天。",
		siteurl: "https://blog.cuteleaf.cn",
		tags: ["Blog"],
		weight: 20, // 权重，数字越大排序越靠前
		enabled: true, // 是否启用
	},
	{
		title: "运维开发绿皮书",
		imgurl: "https://www.geekery.cn/logo.svg",
		desc: "飞放置我的笔记、搜集、摘录、实践，保持好奇心。看文需谨慎，后果很严重!",
		siteurl: "https://www.geekery.cn/",
		tags: ["Blog"],
		weight: 19, // 权重，数字越大排序越靠前
		enabled: true, // 是否启用
	},
	{
		title: "运维小弟",
		imgurl: "https://s3api.srebro.cn/picgo/202509231039038.webp",
		desc: "专注技术积累，探索运维之道",
		siteurl: "https://blog.srebro.cn",
		tags: ["Blog"],
		weight: 18, // 权重，数字越大排序越靠前
		enabled: true, // 是否启用
	},
];

// 获取启用的友链并进行排序
export const getEnabledFriends = (): FriendLink[] => {
	const friends = friendsConfig.filter((friend) => friend.enabled);

	if (friendsPageConfig.randomizeSort) {
		return friends.sort(() => Math.random() - 0.5);
	}

	return friends.sort((a, b) => b.weight - a.weight);
};
