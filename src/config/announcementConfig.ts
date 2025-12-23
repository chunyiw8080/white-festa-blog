import type { AnnouncementConfig } from "../types/config";

export const announcementConfig: AnnouncementConfig = {
	title: "公告 - 2025/12/21", // 公告标题
	content: "本站框架已由Ghost迁移到Astro!", // 公告内容
	closable: false, // 允许用户关闭公告
	link: {
		enable: false, // 启用链接
		text: "了解更多", // 链接文本
		url: "/about/", // 链接 URL
		external: false, // 内部链接
	},
};
