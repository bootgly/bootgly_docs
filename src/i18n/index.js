const langs = [
  'en-US',
  'pt-BR'
]
const i18n = {}

const subpages = [
  'overview',
  'samples',
  'versus'
]
const paths = [
  'Bootgly/what',
  'Bootgly/why',
  'Bootgly/structure/directory',
  'CLI/Terminal/Input',
  'CLI/Terminal/Output'
]

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
function load (page, subpage, lang) {
  const markdown = require(`pages/${page}/${subpage}.${lang}.md`)

  const content = String(markdown.default)

  const source = filter(content)

  return source
}

// TODO dinamically using Vue Router Routes
langs.forEach((lang) => {
  i18n[lang] = require(`./${lang}/index.hjson`)

  const _ = i18n[lang]._

  subpages.forEach((subpage) => {
    switch (subpage) {
      case 'overview':
        _.Bootgly.what.overview.source = load(paths[0], subpage, lang)
        _.Bootgly.why.overview.source = load(paths[1], subpage, lang)
        _.Bootgly.structure.directory.overview.source = load(paths[2], subpage, lang)
        _.CLI.Terminal.Input.overview.source = load(paths[3], subpage, lang)
        _.CLI.Terminal.Output.overview.source = load(paths[4], subpage, lang)
        break
      case 'samples':
        _.CLI.Terminal.Input.samples.source = load(paths[3], subpage, lang)
    }
  })
})

export default i18n
