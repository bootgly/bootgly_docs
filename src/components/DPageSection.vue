<template lang="pug">
section
  template(v-for="token in tokenized")
    d-h2(
      v-if="token.tag === 'h2'"
      :id="this.id + token.map[0]"
      :value="token.content"
    )
    d-h3(
      v-else-if="token.tag === 'h3'"
      :id="this.id + token.map[0]"
      :value="token.content"
    )
    d-h4(
      v-else-if="token.tag === 'h4'"
      :id="this.id + token.map[0]"
      :value="token.content"
    )
    d-h5(
      v-else-if="token.tag === 'h5'"
      :id="this.id + token.map[0]"
      :value="token.content"
    )
    d-h6(
      v-else-if="token.tag === 'h6'"
      :id="this.id + token.map[0]"
      :value="token.content"
    )
    ul(
      v-else-if="token.tag === 'ul'"
    )
      li(
        v-for="item in token.children"
        v-html="item.content"
      )
    ol(
      v-else-if="token.tag === 'ol'"
    )
      li(
        v-for="item in token.children"
        v-html="item.content"
      )
    p(
      v-else-if="token.tag === 'p'"
      v-html="token.content"
    )
    d-page-source-code(
      v-else-if="token.tag === 'code'"
      :index="this.id"
      :text="token.content"
      :language="token.info"
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
      const parsed = Markdown.parse(texts)
      // @ map
      const tokens = []
      let level = 0
      let tag = ''
      const children = []
      parsed.forEach((element) => {
        if (element.type === 'bullet_list_open' || element.type === 'ordered_list_open') {
          level++
        }

        if (element.type === 'inline') {
          element.content = Markdown.renderInline(element.content)
        }

        if (level === 0) {
          switch (element.type) {
            case 'heading_open':
            case 'paragraph_open':
            case 'list_item_open':
              tag = element.tag
          }

          if (element.type === 'inline') {
            tokens.push({
              tag,
              map: element.map,
              content: element.content,
              info: element.info,
              children
            })
          }
        } else if (level === 1) {
          switch (element.type) {
            case 'list_item_open':
              tag = element.tag
              break
            case 'bullet_list_open':
              tokens.push({
                tag: 'ul',
                children
              })
              break
            case 'ordered_list_open':
              tokens.push({
                tag: 'ol',
                children
              })
              break
            case 'inline':
              // TODO support to level > 1
              tokens[tokens.length - 1].children.push({
                tag,
                content: element.content
              })
          }
        }

        if (element.type === 'bullet_list_close') {
          level--
        }
      })

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
