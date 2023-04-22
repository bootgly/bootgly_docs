const langs = [
  'en-US',
  'pt-BR'
]
const i18n = {}

function load (page, lang) {
  return require(`pages/sources/${page}/overview.${lang}.md`).default
}

langs.forEach((lang) => {
  i18n[lang] = require(`./${lang}/index.hjson`)

  const pages = i18n[lang]._

  // TODO dinamically using Vue Router Routes
  pages.about.overview.source = load('about', lang)
  pages.about.structure.directory.overview.source = load('about/structure/directory', lang)
})

export default i18n
