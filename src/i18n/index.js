const langs = [
  'en-US',
  'pt-BR'
]
const i18n = {}
import pages from 'pages'

function filter (source) {
  const regex1 = /{/gm
  const regex2 = /}/gm
  const regex3 = /([@|])+/gm

  source = source
    .replace(regex1, '&#123;')
    .replace(regex2, '&#125;')
    .replace(regex3, "{'$&'}")

  return source
}
function load (path, subpage, lang) {
  const markdown = require(`pages/${path}/${subpage}.${lang}.md`)

  const content = String(markdown.default)

  const source = filter(content)

  return source
}

for (const lang of langs) {
  i18n[lang] = require(`./${lang}/index.hjson`)

  for (const page of pages) {
    const path = page.path.slice(1)
    const config = page.config
    // const data = page.data

    // ---

    const dirs = path.split('/')
    const _ = dirs.reduce((accumulator, current) => {
      let node = accumulator[current]

      // Create object if not exists
      if (!node) {
        node = {}
      }

      /*
      if (!node._) {
        node._ = data?.title
      }
      */

      return node
    }, i18n[lang]._)

    // ---

    if (config === null || config.status === 'empty') {
      continue
    }

    // Overview
    _.overview.source = load(path, 'overview', lang)
    // showcase
    if (config.subpages.showcase === true) {
      _.showcase.source = load(path, 'showcase', lang)
    }
    // Vs
    if (config.subpages.vs === true) {
      _.vs.source = load(path, 'vs', lang)
    }
  }
}

export default i18n
