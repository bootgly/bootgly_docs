import enUS from './en-US/index.hjson'
import ptBR from './pt-BR/index.hjson'

function load (page, lang) {
  return require(`pages/sources/${page}.${lang}.md`).default
}

// TODO dinamically
enUS._.about.introduction.overview.source = load('about/introduction', 'en-US')
enUS._.about.structure.directory.overview.source = load('about/structure/directory', 'en-US')

ptBR._.about.introduction.overview.source = load('about/introduction', 'pt-BR')
ptBR._.about.structure.directory.overview.source = load('about/structure/directory', 'pt-BR')

export default {
  'en-US': enUS,
  'pt-BR': ptBR
}
