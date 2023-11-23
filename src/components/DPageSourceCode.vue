<template lang="pug">
.source-code
  .code(:class="coloring")
    .lines(v-if="lines && lines > 1")
      template(v-for="(line, index) in lines" :key="index")
        a.line(:href="href+line")
          i.fa.fa-link(aria-hidden="true" data-hidden="true")
          span(:id="`${anchor}${line}`") {{ line }}
    .copy
      q-btn(
        flat square dense size="xs"
        :disable="copyBtnDisabled"
        :color="copyBtnColor"
        :icon="copyBtnIcon"
        @click="copyCode"
      )
    .language {{ language }}
    pre
      code(:class="`language-${language}`" v-html="highlighted" ref="code")
</template>

<script>
import Prism from 'prismjs'
// @ Load Prism languages
import 'prismjs/components/prism-markup-templating' // dependency for prism-php extension
// PHP
import 'prismjs/components/prism-php'
import 'prismjs/components/prism-bash'

export default {
  name: 'DPageSourceCode',

  props: {
    index: {
      type: Number,
      required: true
    },
    language: {
      type: String,
      default: 'html'
    },
    text: {
      type: String,
      required: true
    }
  },

  data () {
    return {
      copyBtnDisabled: false,
      copyBtnColor: null,
      copyBtnIcon: 'content_copy'
    }
  },
  computed: {
    href () {
      return `${this.$store.state.page.absolute}#${this.anchor}`
    },
    coloring () {
      return this.$q.dark.isActive ? 'dark' : 'white'
    },

    anchor () {
      return this.printToLetter(this.index + 1)
    },
    lines () {
      const splited = this.text.split(/\r\n|\n/)
      const lines = splited.length

      return lines - 1
    },
    highlighted () {
      if (!this.text) {
        return ''
      }

      const text = this.text.replace(/&#123;/g, '{').replace(/&#125;/g, '}').replace(/&amp;/g, '&')

      const highlighted = Prism.highlight(
        text,
        Prism.languages[this.language],
        this.language
      )

      return highlighted
    }
  },

  methods: {
    copyCode () {
      const code = this.$refs.code

      if (code) {
        // Creates a Range object
        const range = document.createRange()

        // Select the text of the element
        range.selectNodeContents(code)

        // Create a selection
        const selection = window.getSelection()
        selection.removeAllRanges()
        selection.addRange(range)

        try {
          document.execCommand('copy')

          this.copyBtnDisabled = true
          this.copyBtnColor = 'positive'
          this.copyBtnIcon = 'done'

          setInterval(() => {
            this.copyBtnDisabled = false
            this.copyBtnColor = null
            this.copyBtnIcon = 'content_copy'
          }, 3000)
        } catch (err) {
          console.error('Error copying text: ', err)
        } finally {
          selection.removeAllRanges()
        }
      }
    },
    // TODO move to library/utils
    printToLetter (number) {
      const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
      let result = ''

      while (number > 0) {
        const charIndex = (number - 1) % 26
        result = alphabet.charAt(charIndex) + result
        number = Math.floor((number - 1) / 26)
      }

      return result
    }
  }
}
</script>

<style lang="sass">
.source-code
  box-shadow: 0 1px 1px rgb(0 0 0 / 13%)
  max-width: calc(100vw - 40px)
  margin: 32px 0 16px

  .code
    position: relative
    font-family: "Menlo", "DejaVu Sans Mono", "Liberation Mono", "Consolas", "Ubuntu Mono", "Courier New", "Andale Mono", "Lucida Console", Monospace
    border: 1px solid #ddd
    border-bottom: 1px solid #ccc
    border-radius: 3px
    margin: 0
    padding: 0

    .lines
      padding: 12px 5px 8px 5px
      text-align: right
      float: left
      -webkit-user-select: none
      user-select: none

      a
        display: block
        font-size: 90% !important
        min-height: 19px
        white-space: nowrap
        padding: 0 3px

        &:hover
          i
            visibility: visible

        i
          float: left
          margin-top: 3px
          margin-right: 5px
          visibility: hidden

    .copy
      border-color: #ddd
      border-style: solid
      border-width: 1px 1px 0px 1px
      color: gray
      padding: 0
      position: absolute
      right: 35px
      top: -27px
      user-select: none

      button
        padding: 6px
    .language
      border-color: #ddd
      border-style: solid
      border-width: 1px 1px 0px 1px
      color: gray
      padding: 3px 5px
      position: absolute
      right: -1px
      top: -27px
      user-select: none

    pre
      display: flex

      margin: 0
      border: 0
      padding: 10px

      white-space: pre
      word-wrap: normal

      line-height: 19px

      overflow: auto
      overflow-y: hidden

      > code
        display: block
        font-size: 90%
        padding: 0

    &.white
      .language
        background-color: white
      .lines
        background-color: #fafafa
        a
          border-color: #f0f0f0
          color: #565555 !important
        a:hover
          border-color: #f0f0f0
          color: #565555 !important

      .token.comment,
      .token.prolog,
      .token.doctype,
      .token.cdata
        color: #4e5a65

      .token.punctuation
        color: #999

      .token.namespace
        opacity: .7

      .token.property,
      .token.tag,
      .token.boolean,
      .token.number,
      .token.constant,
      .token.class-name,
      .token.symbol,
      .token.deleted
        color: #905

      .token.selector,
      .token.attr-name,
      .token.string,
      .token.char,
      .token.builtin,
      .token.inserted
        color: #416200

      .token.operator,
      .token.entity,
      .token.url,
      .language-css .token.string,
      .style .token.string
        color: #9a6e3a

      .token.atrule,
      .token.attr-value,
      .token.keyword
        color: #07a

      .token.function
        color: #9a3449

      .token.regex,
      .token.important,
      .token.variable
        color: #7b4f00

      .token.important,
      .token.bold
        font-weight: bold
      .token.italic
        font-style: italic

      .token.entity
        cursor: help

    &.dark
      .language
        background-color: #000
      .lines
        background-color: #000
        a
          border-color: #f0f0f0
          color: #969696 !important
        a:hover
          border-color: #f0f0f0
          background-color: transparent !important

      // TODO Andromeda Colorized
      .token.comment,
      .token.prolog,
      .token.doctype,
      .token.cdata
        color: #A0A1A7cc

      .token.punctuation
        color: #D5CED9

      .token.namespace
        opacity: .7

      .token.property
        color: #7CB7FF // Blue
      .token.constant.boolean
        color: #f39c12 // Orange
      .token.number
        color: #f39c12 // Orange

      .token.class-name
        color: #ff68bc
      .token.constant
        color: #ff68bc
      .token.tag,
      .token.symbol,
      .token.deleted
        color: #FF66BA

      .token.selector,
      .token.attr-name,
      .token.string,
      .token.char,
      .token.builtin,
      .token.inserted
        color: #96E072

      .token.operator,
      .token.entity,
      .token.url,
      .language-css .token.string,
      .style .token.string
        color: #9a6e3a

      .token.atrule,
      .token.attr-value,
      .token.keyword
        color: #c74ded // Purple

      .token.function
        color: #FFE66D

      .token.regex,
      .token.important,
      .token.variable
        color: #7CB7FF // Blue

      .token.important,
      .token.bold
        font-weight: bold
      .token.italic
        font-style: italic

      .token.entity
        cursor: help
</style>
