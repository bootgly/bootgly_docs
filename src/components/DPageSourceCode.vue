<template lang="pug">
.source-code
  .code(:class="coloring")
    .lines(v-if="lines")
      template(v-for="(line, index) in lines" :key="index")
        a.line(:href="href+line" :id="`${anchor}${line}`")
          i.fa.fa-link(aria-hidden="true" data-hidden="true")
          span {{ line }}
    pre
      code(:class="`language-${language}`" v-html="highlighted")
</template>

<script>
import Prism from 'prismjs'
// @ Load Prism languages
import 'prismjs/components/prism-markup-templating' // dependency for prism-php extension
// PHP
import 'prismjs/components/prism-php'

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

      const highlighted = Prism.highlight(this.text, Prism.languages[this.language], this.language)

      return highlighted
    }
  },

  methods: {
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

  .code
    font-family: "Menlo", "DejaVu Sans Mono", "Liberation Mono", "Consolas", "Ubuntu Mono", "Courier New", "Andale Mono", "Lucida Console", Monospace
    border: 1px solid #ddd
    border-bottom: 1px solid #ccc
    border-radius: 3px
    margin: 0
    padding: 0

    .lines
      padding: 10px 5px
      text-align: right
      float: left
      -webkit-user-select: none
      user-select: none
      background-color: #fafafa

      a
        display: block
        border-color: #f0f0f0
        font-size: 90% !important
        min-height: 19px
        white-space: nowrap
        padding: 0 3px
        color: rgba(27, 31, 35, 0.5) !important

        &:hover
          i
            visibility: visible

        i
          float: left
          margin-top: 3px
          margin-right: 5px
          visibility: hidden

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
        min-width: 100%
        padding: 0

    &.white
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

      .token.function,
      .token.class-name
        color: #DD4A68

      .token.regex,
      .token.important,
      .token.variable
        color: #e90

      .token.important,
      .token.bold
        font-weight: bold
      .token.italic
        font-style: italic

      .token.entity
        cursor: help
    &.dark
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
      .token.constant
        color: #ff68bc
      .token.tag,
      .token.symbol,
      .token.deleted
        color: #905

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

      .token.function,
      .token.class-name
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
