<template lang="pug">
#d-page-meta
  #d-page-edit
    q-btn(dense no-caps text-color="black" :color="color" @click="openURL(URL)" aria-label="Edit page on Github")
      q-icon.q-mr-xs(name="fab fa-github" size="20px")
      span.hm(v-if="status === 'done'") {{ $t('footer.github.edit') }}
      span.hm(v-else-if="status === 'draft'") {{ $t('footer.github.complete') }}
      span.hm(v-else-if="status === 'empty'") {{ $t('footer.github.start') }}
  #d-page-translation
    q-chip.languages-progress.q-mr-xs.q-ml-none(dense square)
      q-icon.q-mr-xs(name="translate" size="20px")
      span {{ $i18n.locale }}:
        b {{ ' ' + progress }}
      q-tooltip(v-if="$q.platform.is.desktop" anchor="top middle" self="bottom middle" :offset="[10, 10]") {{ $t('footer.progress') }}

    q-chip.languages-available.q-ma-none(dense square)
      q-icon.q-mr-xs(name="language" size="20px")
      span {{ '#' + languages }}
      q-tooltip(v-if="$q.platform.is.desktop" anchor="top middle" self="bottom middle" :offset="[10, 10]") {{ $t('footer.translations') }}

  nav#d-page-nav
    router-link.link.float-left(v-if="prev" :to="`${prev}/overview`")
      div.text-caption
        | {{ $t('nav.prev') }}
      q-icon(name="navigate_before")
      span {{ $t(`_${prev.replace(/_$/, '').replace(/\//g, '.')}._`) }}
    router-link.link.float-right(v-if="next" :to="`${next}/overview`")
      div.text-caption
        | {{ $t('nav.next') }}
      span {{ $t(`_${next.replace(/_$/, '').replace(/\//g, '.')}._`) }}
      q-icon(name="navigate_next")
</template>

<script>
import { openURL } from 'quasar'

export default {
  name: 'DPageMeta',

  data () {
    return {
      base: 'https://github.com/bootgly/bootgly_docs/blob/master/src/pages/'
    }
  },
  computed: {
    // Edit
    status () {
      return this.$route.meta.status
    },
    URL () {
      const base = this.base

      const path = this.$route.path.replace(/\/([^/]*)$/, '.$1')

      const locale = this.$i18n.locale

      return `${base}${path}.${locale}.md`
    },
    color () {
      if (this.status === 'done') {
        return 'white'
      } else if (this.status === 'draft') {
        return 'warning'
      } else {
        return 'red-6'
      }
    },
    icon () {
      if (this.status === 'done') {
        return 'edit'
      } else if (this.status === 'draft') {
        return 'border_color'
      } else {
        return 'note_add'
      }
    },

    // Translation
    progress () {
      // i18n
      // |-> paths
      const i18nPathAbsolute = this.$store.state.i18n.absolute

      // Sections
      const sections = `_.${i18nPathAbsolute}._sections`

      const sectionsCount = this.$tm(`${sections}.count`)

      let translationPercent = '?'

      if (!isNaN(sectionsCount)) {
        const subsectionsDone = this.$tm(`${sections}.done`)
        if (!isNaN(subsectionsDone)) {
          translationPercent = ~~((subsectionsDone / sectionsCount) * 100)
        }
      }

      return `${translationPercent}%`
    },
    languages () {
      // i18n
      // |-> paths
      const i18nPathAbsolute = this.$store.state.i18n.absolute

      // translations
      const translations = `_.${i18nPathAbsolute}._translations`

      // Get # of i18n locales available
      const i18nLocales = Object.keys(this.$i18n.messages)
      // Get page last updated status of default language
      let fallbackLastUpdated = null
      if (this.$te(translations, 'en-US')) {
        fallbackLastUpdated = this.$tm(translations, 'en-US')
      }

      // Set page content locales available
      let i18nLocalesAvailable = 0
      if (fallbackLastUpdated) {
        for (let i = 0; i < i18nLocales.length; i++) {
          if (this.$t(translations, i18nLocales[i]) !== fallbackLastUpdated) {
            i18nLocalesAvailable++
          }
        }
      } else {
        i18nLocalesAvailable = 1
      }

      return `${i18nLocalesAvailable}/${i18nLocales.length}`
    },

    // Navigation
    prev () {
      const base = this.$store.state.page.base
      const routes = this.$router.options.routes.slice(0, -2)

      for (let i = 0; i < routes.length; i++) {
        if ('/' + base === routes[i].path) {
          if (i > 0) {
            return routes[i - 1].path
          }
        }
      }

      return ''
    },
    next () {
      const base = this.$store.state.page.base
      const routes = this.$router.options.routes.slice(0, -2)

      for (let i = 0; i < routes.length; i++) {
        if ('/' + base === routes[i].path) {
          if (typeof routes[i + 1] !== 'undefined') {
            return routes[i + 1].path
          }
        }
      }

      return ''
    }
  },

  methods: {
    openURL
  }
}
</script>

<style lang="sass">
#d-page-meta
  max-width: 1200px
  display: block
  width: 100%
  min-height: 36px
  margin: 15px auto 40px auto
  border-top: 3px solid #e0e0e0

  #d-page-edit
    display: inline-block
    margin-top: 20px
  #d-page-translation
    float: right
    margin-top: 20px

  #d-page-nav
    &:first-child
      margin-top: calc(100vh - 200px)

    .link
      margin-top: 20px
      border: 1px solid #e0e0e0
      padding: 15px !important
</style>
