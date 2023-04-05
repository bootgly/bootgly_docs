<template lang="pug">
section(v-html="render()")
</template>

<script>
import MarkdownIt from 'markdown-it'
import Prism from 'prismjs'

export default {
  name: 'DPageSection',

  props: {
    id: {
      type: Number,
      required: false
    }
  },

  data () {
    return {
      rendered: false,
      paragraphs: []
    }
  },
  methods: {
    render () {
      const absolute = this.$store.state.i18n.absolute

      if (!absolute) {
        return
      }

      let paragraphs = ''
      const Markdown = new MarkdownIt({
        highlight: function (code, lang) {
          if (lang && Prism.languages[lang]) {
            return Prism.highlight(code, Prism.languages[lang], lang)
          }

          return code
        }
      })

      const paragraph = this.$t(`_.${absolute}.texts[${this.id}]`)

      paragraphs = Markdown.render(paragraph)

      return paragraphs
    }
  }
}
</script>

<style lang="sass">
.content
  p
    line-height: 1em

  &.overview
    word-spacing: 0.05em
</style>
