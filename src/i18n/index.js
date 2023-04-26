const langs = [
  'en-US',
  'pt-BR'
]
const i18n = {}

const paths = [
  'Bootgly',
  'Bootgly/structure/directory',
  'CLI/Terminal/Input',
  'CLI/Terminal/Output'
]

function load (page, lang) {
  const required = require(`pages/sources/${page}/overview.${lang}.md`)
  const result = String(required.default)

  const regex = /(.{0,2})([@|])(.{0,2})/gm
  const source = result.replace(regex, function (match, p1, p2, p3) {
    if (match !== "{'" + p2 + "'}") {
      return p1 + "{'" + p2 + "'}" + p3
    }

    return match
  })

  return source
}

langs.forEach((lang) => {
  i18n[lang] = require(`./${lang}/index.hjson`)

  const _ = i18n[lang]._

  // TODO dinamically using Vue Router Routes
  _.Bootgly.overview.source = load(paths[0], lang)
  _.Bootgly.structure.directory.overview.source = load(paths[1], lang)
  _.CLI.Terminal.Input.overview.source = load(paths[2], lang)
  _.CLI.Terminal.Output.overview.source = load(paths[3], lang)
})

export default i18n
