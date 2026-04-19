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
    version: 'v0.13.14-beta',
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
  // @ Homepage Link headers for agent discovery (optional)
  linkHeaders: {
    enabled: true,
    apiCatalog: '/.well-known/api-catalog',
    serviceDoc: '/',
    serviceDesc: '/mcp',
    describedBy: '/llms.txt'
  },
  apiCatalog: {
    enabled: true,
    path: '/.well-known/api-catalog',
    items: ['/mcp']
  },
  markdownNegotiation: {
    enabled: true,
    agentFallback: true
  },
  webBotAuth: {
    enabled: true,
    directoryPath: '/.well-known/http-message-signatures-directory',
    jwksEnv: 'WEB_BOT_AUTH_JWKS',
    privateJwkEnv: 'WEB_BOT_AUTH_PRIVATE_JWK',
    keyIdEnv: 'WEB_BOT_AUTH_KEY_ID',
    keyId: null,
    signatureMaxAge: 300,
    signatureLabel: 'sig1'
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
