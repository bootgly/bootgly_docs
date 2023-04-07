<template lang="pug">
section
  template(v-for="token in tokenized")
    d-h2(
      v-if="token.tag === 'h2'"
      :id="this.id + 2"
      :value="token.content"
    )
    d-h3(
      v-else-if="token.tag === 'h3'"
      :id="this.id + 3"
      :value="token.content"
    )
    d-h4(
      v-else-if="token.tag === 'h4'"
      :id="this.id + 4"
      :value="token.content"
    )
    d-h5(
      v-else-if="token.tag === 'h5'"
      :id="this.id + 5"
      :value="token.content"
    )
    d-h6(
      v-else-if="token.tag === 'h6'"
      :id="this.id + 6"
      :value="token.content"
    )
    li(
      v-else-if="token.tag === 'li'"
      v-html="token.content"
    )
    p(
      v-else-if="token.tag === 'p'"
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

import DH2 from './DH2.vue'
import DH3 from './DH3.vue'
import DH4 from './DH4.vue'
import DH5 from './DH5.vue'
import DH6 from './DH6.vue'
import DPageSourceCode from './DPageSourceCode.vue'

export default {
  name: 'DPageSection',
  components: {
    DH2,
    DH3,
    DH4,
    DH5,
    DH6,
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
      let tokens = Markdown.parse(texts)
      // @ map
      let level = 0
      let tag = ''
      tokens.map((token) => {
        if (token.type === 'bullet_list_open') {
          level++
        }

        if (level === 0) {
          switch (token.type) {
            case 'heading_open':
            case 'paragraph_open':
            case 'list_item_open':
              tag = token.tag
          }
        } else if (level === 1 && token.type === 'list_item_open') {
          tag = token.tag
        }

        if (token.type === 'inline') {
          token.content = Markdown.renderInline(token.content)
          token.tag = tag
        }

        if (token.type === 'bullet_list_close') {
          level--
        }

        return token
      })
      // @ Clean open tags
      tokens = tokens.filter((value) => {
        switch (value.type) {
          case 'heading_open':
          case 'heading_close':
          case 'paragraph_open':
          case 'paragraph_close':
          case 'bullet_list_open':
          case 'bullet_list_close':
          case 'list_item_open':
          case 'list_item_close':
            return false
        }

        return true
      })

      console.log(tokens)

      return tokens
    }
  },
  // @ Events
  created () {
    // console.log('DPageSection - created!')
  },
  mounted () {
    // console.log('DPageSection - mounted!!')
  },
  beforeUpdate () {
    // console.log('DPageSection - beforeUpdate!')
  },
  updated () {
    // console.log('DPageSection - updated!')
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
