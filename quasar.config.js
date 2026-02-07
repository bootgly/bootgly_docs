import { configure, createQuasarConfig } from '@docsector/docsector-reader/quasar-factory'

export default configure(() => {
  return createQuasarConfig({
    projectRoot: import.meta.dirname,
    pwa: {
      name: 'Bootgly PHP Framework Documentation',
      short_name: 'Bootgly Docs',
      description: 'Documentation of Bootgly PHP Framework',
      theme_color: '#027be3'
    }
  })
})
