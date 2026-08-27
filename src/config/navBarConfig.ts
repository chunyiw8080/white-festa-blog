import {
	type NavBarConfig,
	type NavBarLink,
	type NavBarSearchConfig,
	NavBarSearchMethod,
} from "../types/navBarConfig";

const getDynamicNavBarConfig = (): NavBarConfig => {
	const links: NavBarLink[] = [
		LinkPresets.Home,
		LinkPresets.Archive,
		LinkPresets.Dynamic,
	];

	links.push({
		name: "关于",
		url: "#",
		icon: "material-symbols:info",
		children: [LinkPresets.Sponsor, LinkPresets.About, LinkPresets.Bangumi],
	});

	links.push(LinkPresets.Guestbook, LinkPresets.Friends);

	links.push({
		name: "我的站点",
		url: "#",
		icon: "material-symbols:star",
		children: [
			{
				name: "Images - 博客图床",
				url: "https://images.white-festa.net/dashboard",
				external: true,
				icon: "fa7-solid:image",
			},
			// {
			// 	name: "Adocs - 实施文档",
			// 	url: "https://adocs.white-festa.net/",
			// 	external: true,
			// 	icon: "fa7-solid:pen",
			// },
			{
				name: "Portfolio - 个人简历",
				url: "https://portfolio.white-festa.net",
				external: true,
				icon: "fa7-solid:file",
			},
		],
	});

	return { links } as NavBarConfig;
};

export const navBarSearchConfig: NavBarSearchConfig = {
	method: NavBarSearchMethod.PageFind,
};

export const LinkPresets: Record<string, NavBarLink> = {
	Home: {
		name: "主页",
		url: "/",
		icon: "material-symbols:home",
	},
	Dynamic: {
		name: "动态",
		url: "/dynamic/",
		icon: "material-symbols:forum-rounded",
		pageKey: "dynamic",
	},
	Archive: {
		name: "归档",
		url: "/archive/",
		icon: "material-symbols:archive",
	},
	Categories: {
		name: "分类",
		url: "/categories/",
		icon: "material-symbols:category",
	},
	Tags: {
		name: "标签",
		url: "/tags/",
		icon: "material-symbols:tag-rounded",
	},
	Friends: {
		name: "友链",
		url: "/friends/",
		icon: "material-symbols:supervisor-account-rounded",
		pageKey: "friends",
	},
	Guestbook: {
		name: "留言",
		url: "/guestbook/",
		icon: "material-symbols:chat",
		pageKey: "guestbook",
	},
	Gallery: {
		name: "相册",
		url: "/gallery/",
		icon: "material-symbols:photo-library",
		pageKey: "gallery",
	},
	Bangumi: {
		name: "番组计划",
		url: "/bangumi/",
		icon: "material-symbols:movie-outline-rounded",
		pageKey: "bangumi",
	},
	Sponsor: {
		name: "打赏",
		url: "/sponsor/",
		icon: "material-symbols:coffee-rounded",
		pageKey: "sponsor",
	},
	About: {
		name: "关于",
		url: "/about/",
		icon: "material-symbols:info",
	},
};

export const navBarConfig: NavBarConfig = getDynamicNavBarConfig();
