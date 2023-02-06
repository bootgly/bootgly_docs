<template lang="pug">
q-page-container
  q-page#content.q-pa-lg
    .text-center
      h1 Bootgly PHP Framework Documentation
        span.q-ml-sm.text-negative (WIP)
      p.caption
        span(v-html="t('_.home.texts[0]') + t('_.home.texts[1]') + t('_.home.texts[2]')")
        a(href="https://github.com/bootgly/bootgly-php-framework/" target="_blank") Bootgly PHP Framework
        | !
      p.caption
        span
        | {{ $t('_.home.texts[3]') }}
        a(href="https://github.com/rodrigoslayertech/" target="_blank") @rodrigoslayertech
      hr
</template>

<script>
import translation from 'src/i18n/translation'

export default {
  data () {
    return {
      radio: 'two'
    }
  },
  mixins: [translation]
}
</script>

<style lang="sass">
img.platform
  padding-top: 30px
  padding-bottom: 30px
</style>
