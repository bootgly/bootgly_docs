const langs = [
  'en-US',
  'pt-BR'
]
const i18n = {}

const paths = [
  'about',
  'about/structure/directory',
  'CLI/Terminal/Input'
]

function load (page, lang) {
  const required = require(`pages/sources/${page}/overview.${lang}.md`)
  const result = String(required.default)

  const regex = /(?<!')[@|](?![':.])/gm
  const source = result.replace(regex, function (match) {
    return `{'${match}'}`
  })

  return source
}

langs.forEach((lang) => {
  i18n[lang] = require(`./${lang}/index.hjson`)

  const _ = i18n[lang]._

  // TODO dinamically using Vue Router Routes
  _.about.overview.source = load(paths[0], lang)
  _.about.structure.directory.overview.source = load(paths[1], lang)
  // _.CLI.Terminal.Input.overview.source = load(paths[2], lang)
})

export default i18n
