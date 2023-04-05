<template lang="pug">
section
  template(v-for="token in tokens")
    p(
      v-if="token.type === 'inline'"
      v-html="token.content"
    )
    d-page-source-code(
      v-else-if="token.tag === 'code'"
      :index="this.id"
      :language="token.info"
      :text="token.content"
    )
</template>

<script>
import MarkdownIt from 'markdown-it'

import DPageSourceCode from './DPageSourceCode.vue'

export default {
  name: 'DPageSection',
  components: {
    DPageSourceCode
  },

  props: {
    id: {
      type: Number,
      required: true
    }
  },

  data () {
    return {
      // Data
      tokens: [],
      // Meta
      parsed: false
    }
  },
  methods: {
    parse () {
      const absolute = this.$store.state.i18n.absolute

      if (!absolute) {
        return
      }

      const Markdown = new MarkdownIt()

      const texts = this.$t(`_.${absolute}.texts[${this.id}]`)

      const parsed = Markdown.parse(texts)

      this.tokens = parsed
    }
  },

  mounted () {
    this.parse()
  }
}
</script>

<style lang="sass">
.content
  p
    line-height: 1em

    &.overview
      word-spacing: 0.05em

  .source-code
    margin: 0 0 16px
</style>
