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
		{ label: 'GitHub', href: github, icon: 'github' },
		{ label: 'AppFacts', href: 'https://appfacts.dev/v#af1.eNpFkUFrGzEQhf-KeGc5plddDYEEt5fmVkqZ7E7WE0sjVRq5LMb_PSgb3NugeY_vzdMVF4RvHkqJEfAmytaV4GFrGS-H45OznCM8mpH1hgCaTC4MjygTaxuy708vm2I6I1wRSZdOy9g804V-TlWKefeyFt5meNSuJp_UH3nmh_cGj1NuJroMbsx9fotUGTePmUtD-HWFIoD1b5fKFR4FAaLGdYvkppwS6byLouxKzalYw81vPtImuynHXNuXtdkaRRdnXJMoRZe7lW53x79KusQ76X8mN3OJeU2s9tnOWQy33x6vXeI8Cig0nWnhP4mUFq4IKFrSqJWbIeCdm7lcXZMkkQZgEgQsYqf-6sY1WUdyVC65ieW6IuBkVlrY7zfZw5TT_kBGcW22e8x14d3xeNjfP_H2AeS2o5g' }
	]
});
