import { defineFilepressConfig } from 'getfilepress';

const github = 'https://github.com/Catalyst-Forge-LLC/finetuna';
const npm = 'https://www.npmjs.com/package/finetuna';

export default defineFilepressConfig({
	title: 'Finetuna',
	description: 'VRAM-aware context tuner for Ollama. Named models that stay on the GPU.',
	tagline: 'Keep the context on the GPU.',
	lede: 'CLI · num_ctx · named models',
	url: 'https://finetuna.net',
	author: 'Catalyst Forge LLC',
	logo: '/logo.png',
	ogImage: '/logo.png',
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
