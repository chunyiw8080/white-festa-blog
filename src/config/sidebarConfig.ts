import type { SidebarLayoutConfig } from "../types/sidebarConfig";

export const sidebarLayoutConfig: SidebarLayoutConfig = {
	enable: true,
	position: "both",
	tabletSidebar: "left",
	showBothSidebarsOnPostPage: true,

	leftComponents: [
		{
			type: "profile",
			enable: true,
			position: "top",
			showOnPostPage: true,
		},
		{
			type: "dynamic",
			enable: true,
			position: "top",
			showOnPostPage: true,
			specificConfig: { dynamic: { limit: 2 } },
		},
		// {
		// 	type: "announcement",
		// 	enable: true,
		// 	position: "top",
		// 	showOnPostPage: true,
		// },
		{
			type: "categories",
			enable: true,
			position: "sticky",
			showOnPostPage: true,
			specificConfig: { collapseThreshold: 5 },
		},
		{
			type: "tags",
			enable: true,
			position: "sticky",
			showOnPostPage: true,
			specificConfig: { collapseThreshold: 20 },
		},
	],

	rightComponents: [
		{
			type: "music",
			enable: true,
			position: "top",
			showOnPostPage: true,
		},
		{
			type: "sidebarToc",
			enable: true,
			position: "sticky",
			showOnPostPage: true,
			hideOnNonPostPage: true,
		},
		{
			type: "stats",
			enable: true,
			position: "sticky",
			showOnPostPage: true,
		},
		{
			type: "calendar",
			enable: true,
			showTitle: false,
			position: "sticky",
			showOnPostPage: false,
			specificConfig: { calendar: { showHeatmap: true } },
		},
	],

	mobileBottomComponents: [
		{ type: "profile", enable: true, showOnPostPage: true },
		{ type: "announcement", enable: true, showOnPostPage: true },
		{ type: "music", enable: true, showOnPostPage: true },
		{
			type: "categories",
			enable: true,
			showOnPostPage: true,
			specificConfig: { collapseThreshold: 5 },
		},
		{
			type: "tags",
			enable: true,
			showOnPostPage: true,
			specificConfig: { collapseThreshold: 20 },
		},
		{
			type: "dynamic",
			enable: true,
			showOnPostPage: true,
			specificConfig: { dynamic: { limit: 2 } },
		},
		{ type: "stats", enable: true, showOnPostPage: true },
	],
};
