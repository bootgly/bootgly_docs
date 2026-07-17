// @ Import i18n message builder from Docsector Reader
import { buildMessages } from '@docsector/docsector-reader/i18n'
import homePageOverride from 'virtual:docsector-homepage-override'

// @ Import language HJSON files (Vite-compatible eager import)
const langModules = import.meta.glob('./languages/*.hjson', { eager: true })
// @ Import markdown files (lazy raw imports — loaded per page at navigation time)
const mdModules = import.meta.glob('../pages/**/*.md', { query: '?raw', import: 'default' })
// @ Import homepage markdown eagerly (root route content must be ready at boot)
const homepageModules = import.meta.glob('../pages/Homepage.*.md', { eager: true, query: '?raw', import: 'default' })

// @ Import pages
import boot from 'pages/boot'
import { books } from 'virtual:docsector-books'

export default buildMessages({ langModules, mdModules, homepageModules, books, boot, homePageOverride })
