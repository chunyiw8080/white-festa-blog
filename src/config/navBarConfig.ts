import {
	type NavBarConfig,
	type NavBarLink,
	type NavBarSearchConfig,
	NavBarSearchMethod,
} from "../types/navBarConfig";

// ============================================================================
// 导航栏配置 - 根据顺序动态生成导航栏链接
// NavBar Configuration - Dynamically generate navigation bar links based on order
// ============================================================================
const getDynamicNavBarConfig = (): NavBarConfig => {
	// 基础导航栏链接
	const links: NavBarLink[] = [
		// 主页
		LinkPresets.Home,
		// 归档
		LinkPresets.Archive,
		// 番组计划
		LinkPresets.Bangumi,
	];

	// 关于及其子菜单
	links.push({
		name: "关于",
		url: "/content/",
		icon: "material-symbols:info",
		children: [
			// 赞助
			LinkPresets.Sponsor,

			// 关于页面
			LinkPresets.About,
			{
				name: "我的简历",
				url: "https://portfolio.white-festa.net",
				external: true,
				icon: "fa7-solid:file",
			},

		],
	});

	links.push({
		name: "项目",
		url: "/projects/",
		icon: "material-symbols:star",
		children: [
			{
				name: "Reget - 语义化正则匹配引擎",
				url: "https://github.com/chunyiw8080/reget",
				external: true,
				icon: "fa7-brands:github",
			},
		],
	});

	// 留言板
	links.push(LinkPresets.Guestbook);

	// 友链
	links.push(LinkPresets.Friends);

	return { links } as NavBarConfig;
};

// 导航搜索配置
export const navBarSearchConfig: NavBarSearchConfig = {
	method: NavBarSearchMethod.PageFind,
};

// ============================================================================
// 链接预设 - 可自由自定义导航栏链接的名称、图标和URL
// Link Presets - Allows free customization of the name, icon, and URL of navigation bar links
// ============================================================================
export const LinkPresets: Record<string, NavBarLink> = {
	Home: {
		name: "主页",
		url: "/",
		icon: "material-symbols:home",
	},
	Archive: {
		name: "归档",
		url: "/archive/",
		icon: "material-symbols:archive",
	},
	Categories: {
		name: "分类",
		url: "/categories/",
		icon: "material-symbols:folder-open-rounded",
	},
	Tags: {
		name: "标签",
		url: "/tags/",
		icon: "material-symbols:tag-rounded",
	},
	Friends: {
		name: "友链",
		url: "/friends/",
		icon: "material-symbols:group",
	},
	Sponsor: {
		name: "赞助",
		url: "/sponsor/",
		icon: "material-symbols:favorite",
	},
	Guestbook: {
		name: "留言",
		url: "/guestbook/",
		icon: "material-symbols:chat",
	},
	About: {
		name: "关于我",
		url: "/about/",
		icon: "material-symbols:person",
	},
	Bangumi: {
		name: "番组计划",
		url: "/bangumi/",
		icon: "material-symbols:movie",
	},
	Gallery: {
		name: "相册",
		url: "/gallery/",
		icon: "material-symbols:photo-library",
	},
};

export const navBarConfig: NavBarConfig = getDynamicNavBarConfig();
