/**
 * Bootgly PHP Framework — Documentation Configuration
 *
 * @see https://github.com/docsector/docsector-reader
 */
export default {
  // @ Branding
  branding: {
    logo: 'https://docs.bootgly.com/images/logo/bootgly-logo-temp1.png',
    name: 'Bootgly',
    version: 'v0.0.1'
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
    editBaseUrl: 'https://github.com/bootgly/bootgly_docs/edit/master/src/pages'
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
  defaultLanguage: 'en-US'
}
