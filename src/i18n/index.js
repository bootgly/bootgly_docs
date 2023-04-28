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

  const _ = i18n[lang]._

  for (const [path, metadata] of Object.entries(pages)) {
    const dirs = path.split('/')
    const page = dirs.reduce((accumulator, current) => {
      return accumulator[current]
    }, _)

    // Overview
    page.overview.source = load(path, 'overview', lang)
    // Samples
    if (metadata.subpages.samples === true) {
      page.samples.source = load(path, 'samples', lang)
    }
    // Vs
    if (metadata.subpages.vs === true) {
      page.vs.source = load(path, 'vs', lang)
    }
  }
}

export default i18n
