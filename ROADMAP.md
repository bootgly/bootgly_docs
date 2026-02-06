# Bootgly Docs — Roadmap

## Migration: Separate Content from Reader

### Goal

Decouple the documentation **content** (Markdown files) from the **reader application** (rendering engine, UI, routing, etc.) into two independent repositories:

| Repository | Responsibility |
|---|---|
| `bootgly/bootgly_docs` | Only `.md` files, page registry, i18n locale files, and the `docsphere-reader` dependency |
| `docsphere/docsphere-reader` | The universal documentation reader — an NPM package capable of rendering any project's docs |

### Why

- **Reusability** — The reader becomes a standalone product (`docsphere-reader`) usable by any project, not just Bootgly
- **Separation of concerns** — Content authors only edit Markdown; they don't touch the rendering engine
- **Simpler maintenance** — Updating the reader is just `npm update docsphere-reader`; docs content evolves independently
- **Lighter repo** — `bootgly_docs` becomes a pure content repo (~68 `.md` files + config), no Quasar/Vue/Webpack boilerplate

### Current Architecture

```
bootgly_docs/                    ← Everything in one repo
├── src/
│   ├── pages/
│   │   ├── guide/**/*.md        ← Content (Markdown)
│   │   ├── manual/**/*.md       ← Content (Markdown)
│   │   └── index.js             ← Page registry (routes, icons, status)
│   ├── i18n/
│   │   ├── languages/en-US.hjson
│   │   ├── languages/pt-BR.hjson
│   │   └── index.js             ← Build-time MD → i18n injection
│   ├── components/              ← DPage, DMenu, DPageSection, DPageSourceCode...
│   ├── layouts/                 ← DefaultLayout
│   ├── router/                  ← Auto-generated from page registry
│   └── ...
├── quasar.conf.js               ← Quasar/Webpack config
└── package.json                 ← All deps (Quasar, Vue, markdown-it, Prism...)
```

**Rendering pipeline:**
1. `.md` files loaded as raw strings via Webpack `raw-loader`
2. Injected into `vue-i18n` messages at build time
3. At runtime, `DPageSection` retrieves the raw MD string via `t()`
4. Parsed by `markdown-it` + `markdown-it-attrs` in the browser
5. Rendered as Vue components (`DH2`–`DH6`, `DPageSourceCode` with Prism.js)

### Target Architecture

```
bootgly_docs/                    ← Content-only repo
├── pages/
│   ├── guide/**/*.md
│   ├── manual/**/*.md
│   └── index.js                 ← Page registry
├── i18n/
│   ├── en-US.hjson
│   └── pt-BR.hjson
├── docsphere.config.js          ← Reader configuration (theme, logo, links, etc.)
├── package.json                 ← Only depends on docsphere-reader
└── README.md

docsphere-reader/                ← NPM package (separate repo)
├── src/
│   ├── components/              ← DPage, DMenu, DPageSection, DPageSourceCode...
│   ├── layouts/
│   ├── composables/
│   ├── markdown/                ← markdown-it pipeline, Prism.js highlighting
│   ├── router/                  ← Dynamic route generation from page registry
│   ├── i18n/                    ← i18n setup + MD injection logic
│   └── index.ts                 ← Main entry: createDocsphere(config)
├── package.json
└── README.md
```

### How It Would Work

1. `bootgly_docs` declares `docsphere-reader` as a dependency
2. A config file (`docsphere.config.js`) tells the reader:
   - Where to find MD files and the page registry
   - Where to find i18n locale files
   - Theme/branding options (logo, colors, links, etc.)
3. The reader provides the full Quasar/Vue app scaffolding, routing, rendering pipeline
4. Running `npm run dev` or `npm run build` in `bootgly_docs` bootstraps the reader with Bootgly's content
5. The same `docsphere-reader` can be used by any other project — just different MD files and config

### Migration Steps

1. **Extract the reader** — Move all generic components, layouts, composables, markdown pipeline, router logic, and build config from `bootgly_docs` into `docsphere/docsphere-reader`
2. **Define the config contract** — Design `docsphere.config.js` schema (paths, theme, nav structure, i18n options)
3. **Package as NPM** — Publish `docsphere-reader` to NPM with a CLI (`docsphere dev`, `docsphere build`)
4. **Refactor bootgly_docs** — Strip everything except `.md` files, page registry, i18n locales, and the new config file
5. **Verify parity** — Ensure the refactored `bootgly_docs` + `docsphere-reader` renders identically to the current monolithic app

### Open Questions

- Should `docsphere-reader` stay on Quasar or migrate to Nuxt? (Nuxt would align with `bootgly_website`)
- Should the page registry format (`index.js`) be simplified or kept as-is?
- Should `docsphere-reader` support custom components/slots for project-specific rendering?
- How to handle the HJSON → JSON migration (or keep HJSON support in the reader)?
- Versioned docs support (multiple versions of MD files)?

### Links

- Current docs reader source: https://github.com/docsphere/docsphere-reader
- Current docs content + app: https://github.com/bootgly/bootgly_docs
- Live docs: https://docs.bootgly.com
