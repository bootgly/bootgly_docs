<template lang="pug">
section
  template(v-for="token in tokenized")
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
  computed: {
    tokenized () {
      const absolute = this.$store.state.i18n.absolute

      if (!absolute) {
        return
      }

      const texts = this.$t(`_.${absolute}.texts[${this.id}]`)

      const Markdown = new MarkdownIt()
      const tokens = Markdown.parse(texts)
      tokens.map(token => {
        if (token.type === 'inline') {
          token.content = Markdown.renderInline(token.content)
        }

        return token
      })

      return tokens
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

  .source-code
    margin: 0 0 16px
</style>
