import { defineFilepressConfig } from 'getfilepress';

const github = 'https://github.com/Catalyst-Forge-LLC/finetuna';
const npm = 'https://www.npmjs.com/package/finetuna';

export default defineFilepressConfig({
	title: 'Finetuna',
	description: 'Ollama runtime tuner. Check GPU residency and save a named variant.',
	tagline: 'Ollama runtime tuner.',
	lede: 'CLI · runtime settings · named models',
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
		{ label: 'See the rest of the Catalyst Forge shelf.', href: 'https://catalystforge.com/tools/' },
		{ label: 'RSS', href: '/rss.xml' },
		{ label: 'npm', href: npm },
		{ label: 'GitHub', href: github, icon: 'github' },
		{ label: 'AppFacts', href: 'https://appfacts.dev/v#af1.eNpNkcFqIzEQRH9lqLNss1ddDYEszl42txCWjqYz7lhqaaWWl8H435fxBCc3IVV1VT9dcIb_4aCUGB4PomxdCQ42l-Vmf3gcLOcIh2ZkvcGDgsmZ4RAlsLZF9vT4vCrCCf6CSDp1mpaXn3Sm36FKMTc8z4XXMxxqV5Nb6q888vajweGYm4lOS27MfXyPVBlXh5FLg3-5QOHB-rdL5QqHAg9R47pWGkJOiXTcRFEeSs2pWMPVrT7SJpuQY67t09psjqLTYFyTKMUhdyvd7o5_lXSK96SvTsPIJeY5sdqNzkkM11eHty5xXAAUCiea-E8ipYkrPIqWtGDlZvDoOkoLMTce4RAEHpPYsb8NyyZZl9Y45sRlpXg0K83vdu-fH7RVvjHkkptYrvM3zTpoG3La7ckozs02D7lOvDkc9vcJuP4HdequGw' }
	]
});
