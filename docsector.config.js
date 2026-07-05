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
    version: 'v0.20.0-beta',
    versions: [
      {
        id: 'v0.20.0-beta',
        current: true,
        released: false
      },
      {
        id: 'v0.19.1-beta',
        released: true
      },
    ],
    description: 'Bootgly PHP Framework — base architecture for multi-platform, full-stack PHP development'
  },

  // @ Links
  links: {
    website: 'https://bootgly.com',
    github: 'https://github.com/bootgly/bootgly',
    discussions: 'https://github.com/bootgly/bootgly/discussions',
    chat: 'https://t.me/bootgly/',
    email: 'public@bootgly.com',
    changelog: 'https://github.com/bootgly/bootgly/blob/main/CHANGELOG.md',
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
    editBaseUrl: 'https://github.com/bootgly/bootgly_docs/edit/main/src/pages',
    stars: false
  },

  // @ Home page source
  homePage: {
    source: 'remote-readme',
    remoteReadmeUrl: 'https://raw.githubusercontent.com/bootgly/bootgly/refs/heads/main/README.md',
    timeoutMs: 8000,
    fallbackToLocal: true
  },

  // @ MCP (Model Context Protocol)
  mcp: {
    serverName: 'bootgly-docs',
    toolSuffix: 'bootgly'
  },
  mcpServerCard: {
    enabled: true,
    path: '/.well-known/mcp/server-card.json',
    transportEndpoint: '/mcp',
    transportType: 'streamable-http',
    protocolVersion: '2025-03-26',
    capabilities: {
      tools: { supported: true },
      resources: { supported: false },
      prompts: { supported: false }
    }
  },
  webMcp: {
    enabled: true,
    apiMode: 'dual',
    toolPrefix: 'bootgly.docs',
    bridgeEndpoint: '/mcp',
    bridgeToMcp: true,
    tools: {
      searchDocs: true,
      getPage: true,
      navigateTo: true,
      copyCurrentPage: true
    }
  },

  // @ AI Assistant
  aiAssistant: {
    enabled: true,
    provider: 'aiSearch',
    endpoint: '/assistant',
    ui: {
      title: 'Bootgly AI Assistant',
      subtitle: 'Ask, search, or explain the docs.',
      drawerWidth: 380,
      wideBreakpoint: 1280,
      showCitations: true,
      suggestedPrompts: [
        'How do I get started?',
        'Summarize this page.',
        'What is the I2P architecture?',
      ]
    },
    aiSearch: {
      binding: 'AI_SEARCH',
      instanceNameEnv: 'AI_SEARCH_INSTANCE_NAME',
      namespace: '',
      accountIdEnv: 'CLOUDFLARE_ACCOUNT_ID',
      apiTokenEnv: 'CLOUDFLARE_API_TOKEN',
      model: '@cf/meta/llama-4-scout-17b-16e-instruct',
      retrievalType: 'vector',
      maxResults: 10,
      matchThreshold: 0.4,
      contextExpansion: 1,
      queryRewrite: {
        enabled: false
      },
      reranking: {
        enabled: false,
        model: '@cf/baai/bge-reranker-base',
        matchThreshold: 0.4
      },
      stream: true
    }
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
  contentSignals: {
    enabled: true,
    aiTrain: 'yes',
    search: 'yes',
    aiInput: 'yes',
    userAgent: '*',
    applyToAllBlocks: false
  },
  agentSkills: {
    enabled: true,
    path: '/.well-known/agent-skills/index.json',
    schema: 'https://schemas.agentskills.io/discovery/0.2.0/schema.json',
    skills: [
      {
        name: 'bootgly-docs-mcp',
        type: 'skill-md',
        description: 'Search and fetch Bootgly documentation pages through the MCP endpoint.',
        url: '/.well-known/agent-skills/bootgly-docs-mcp/SKILL.md'
      },
      {
        name: 'docsector-documentation-authoring',
        type: 'skill-md',
        description: 'Author Docsector documentation with Markdown, custom blocks, MCP, and WebMCP.',
        url: '/.well-known/agent-skills/docsector-documentation-authoring/SKILL.md'
      }
    ]
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
