import { defineFilepressConfig } from 'getfilepress';

const github = 'https://github.com/Catalyst-Forge-LLC/finetuna';
const npm = 'https://www.npmjs.com/package/finetuna';

export default defineFilepressConfig({
	title: 'Finetuna',
	description:
		'Fit more context on your GPU — and keep it. VRAM-aware context tuner for Ollama.',
	tagline: 'Fit more context on your GPU — and keep it.',
	lede: 'CLI · num_ctx · named models',
	url: 'https://finetuna.net',
	author: 'Catalyst Forge LLC',
	logo: '/logo.svg',
	ogImage: '/logo.svg',
	homePage: 'about',
	topics: [
		{ label: 'Guides', tag: 'guides' },
		{ label: 'Release notes', tag: 'releases' }
	],
	nav: [
		{ label: 'Home', href: '/' },
		{ label: 'Posts', href: '/writing' },
		{ label: 'Install', href: '/install' },
		{ label: 'GitHub', href: github, icon: 'github' }
	],
	footerLinks: [
		{ label: 'RSS', href: '/rss.xml' },
		{ label: 'npm', href: npm },
		{ label: 'GitHub', href: github, icon: 'github' }
	]
});
