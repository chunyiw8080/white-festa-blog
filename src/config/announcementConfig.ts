import type { AnnouncementConfig } from "../types/announcementConfig";

export const announcementConfig: AnnouncementConfig = {
	// 公告标题
	title: "公告 - 2025/12/21",

	// 公告内容
	content: "本站框架已由Ghost迁移到Astro!",

	// 是否允许用户关闭公告
	closable: false,

	link: {
		// 启用链接
		enable: false,
		// 链接文本
		text: "了解更多",
		// 链接 URL
		url: "/about/",
		// 内部链接
		external: false,
	},
};
