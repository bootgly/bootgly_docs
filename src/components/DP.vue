<template lang="pug">
main(v-html="render()")
</template>

<script>
import MarkdownIt from 'markdown-it'

export default {
  name: 'DP',

  props: {
    id: {
      type: String,
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
      const Markdown = new MarkdownIt()

      if (this.id) {
        const paragraph = this.$t(`_.${absolute}.paragraphs[${this.id}]`)

        paragraphs = Markdown.render(paragraph)
      }

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
