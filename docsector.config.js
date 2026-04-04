/**
 * Bootgly PHP Framework — Documentation Configuration
 *
 * @see https://github.com/docsector/docsector-reader
 */
export default {
  // @ Branding
  branding: {
    logo: 'https://docs.bootgly.com/images/logo/bootgly-logo.webp',
    name: 'Bootgly',
    version: 'v0.12.0-beta',
    description: 'Bootgly PHP Framework — base architecture for multi-platform, full-stack PHP development'
  },

  // @ Links
  links: {
    github: 'https://github.com/bootgly/bootgly',
    discussions: 'https://github.com/bootgly/bootgly/discussions',
    chat: 'https://t.me/bootgly/',
    email: 'public@bootgly.com',
    changelog: '/changelog',
    roadmap: 'https://github.com/bootgly/bootgly/milestones',
    sponsor: 'https://github.com/sponsors/bootgly',
    explore: [
      { label: '🤯 Bootgly Awesome', url: 'https://github.com/bootgly/bootgly_awesome' },
      { label: '⏱️ Bootgly Benchmarks (WIP)', url: 'https://github.com/bootgly/bootgly_benchmarks' }
    ]
  },

  // @ GitHub
  github: {
    repo: 'bootgly/bootgly_docs',
    editBaseUrl: 'https://github.com/bootgly/bootgly_docs/edit/master/src/pages'
  },

  // @ MCP (Model Context Protocol)
  mcp: {
    serverName: 'bootgly-docs',
    toolSuffix: 'bootgly'
  },

  // @ Languages
  languages: [
    {
      image: '/images/flags/united-states-of-america.png',
      label: 'English (US)',
      value: 'en-US'
    },
    {
      image: '/images/flags/brazil.png',
      label: 'Português (BR)',
      value: 'pt-BR'
    }
  ],

  // @ Default language
  defaultLanguage: 'en-US',

  // @ Site URL (used for sitemap.xml generation)
  siteUrl: 'https://docs.bootgly.com'
}
