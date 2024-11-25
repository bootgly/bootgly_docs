<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useStore } from 'vuex'
import { openURL } from 'quasar'
import { useI18n } from 'vue-i18n'

const store = useStore()
const route = useRoute()
const router = useRouter()
const { t, locale, availableLocales, te, tm } = useI18n()

const base = 'https://github.com/bootgly/bootgly_docs/blob/master/src/pages/'

const status = computed(() => route.meta.status)
const URL = computed(() => {
  const path = route.path.replace(/\/([^/]*)$/, '.$1')
  return `${base}${path}.${locale.value}.md`
})
const color = computed(() => {
  if (status.value === 'done') {
    return 'white'
  } else if (status.value === 'draft') {
    return 'warning'
  } else {
    return 'red-6'
  }
})
const icon = computed(() => {
  if (status.value === 'done') {
    return 'edit'
  } else if (status.value === 'draft') {
    return 'border_color'
  } else {
    return 'note_add'
  }
})

const progress = computed(() => {
  const i18nPathAbsolute = store.state.i18n.absolute
  const sections = `_.${i18nPathAbsolute}._sections`
  const sectionsCount = tm(`${sections}.count`)
  let translationPercent = '?'

  if (!isNaN(sectionsCount)) {
    const subsectionsDone = tm(`${sections}.done`)
    if (!isNaN(subsectionsDone)) {
      translationPercent = ~~((subsectionsDone / sectionsCount) * 100)
    }
  }

  return `${translationPercent}%`
})

const languages = computed(() => {
  const i18nPathAbsolute = store.state.i18n.absolute
  const translations = `_.${i18nPathAbsolute}._translations`
  const i18nLocales = availableLocales
  let fallbackLastUpdated = null

  if (te(translations, 'en-US')) {
    fallbackLastUpdated = tm(translations, 'en-US')
  }

  let i18nLocalesAvailable = 0
  if (fallbackLastUpdated) {
    for (let i = 0; i < i18nLocales.length; i++) {
      if (t(translations, i18nLocales[i]) !== fallbackLastUpdated) {
        i18nLocalesAvailable++
      }
    }
  } else {
    i18nLocalesAvailable = 1
  }

  return `${i18nLocalesAvailable}/${i18nLocales.length}`
})

const prev = computed(() => {
  const base = store.state.page.base
  const routes = router.options.routes.slice(0, -2)

  for (let i = 0; i < routes.length; i++) {
    if ('/' + base === routes[i].path) {
      if (i > 0) {
        return routes[i - 1].path
      }
    }
  }

  return ''
})

const next = computed(() => {
  const base = store.state.page.base
  const routes = router.options.routes.slice(0, -2)

  for (let i = 0; i < routes.length; i++) {
    if ('/' + base === routes[i].path) {
      if (typeof routes[i + 1] !== 'undefined') {
        return routes[i + 1].path
      }
    }
  }

  return ''
})
</script>

<template lang="pug">
#d-page-meta
  .row.justify-between.q-mt-lg
    #d-page-edit.col
      q-btn(dense no-caps text-color="black" :color="color" @click="openURL(URL)" aria-label="Edit page on Github")
        q-icon.q-mr-xs(name="fab fa-github" size="20px")
        span.hm(v-if="status === 'done'") {{ $t('page.edit.github.edit') }}
        span.hm(v-else-if="status === 'draft'") {{ $t('page.edit.github.complete') }}
        span.hm(v-else-if="status === 'empty'") {{ $t('page.edit.github.start') }}
    #d-page-translation.col-auto
      q-chip.languages-progress.q-mr-xs.q-ml-none(dense square)
        q-icon.q-mr-xs(name="translate" size="20px")
        span {{ $i18n.locale }}:
          b {{ ' ' + progress }}
        q-tooltip(anchor="top middle" self="bottom middle" :offset="[10, 10]") {{ $t('page.edit.progress') }}

      q-chip.languages-available.q-ma-none(dense square)
        q-icon.q-mr-xs(name="language" size="20px")
        span {{ '#' + languages }}
        q-tooltip(anchor="top end" self="bottom end" :offset="[10, 10]") {{ $t('page.edit.translations') }}

  nav#d-page-nav.row
    router-link.link.col(v-if="prev" :to="`${prev}/overview`")
      div.text-caption
        | {{ $t('page.nav.prev') }}
      q-icon(name="navigate_before")
      span {{ $t(`_${prev.replace(/_$/, '').replace(/\//g, '.')}._`) }}
    router-link.link.col(v-if="next" :to="`${next}/overview`")
      div.text-caption
        | {{ $t('page.nav.next') }}
      span {{ $t(`_${next.replace(/_$/, '').replace(/\//g, '.')}._`) }}
      q-icon(name="navigate_next")
</template>

<style lang="sass">
#d-page-meta
  max-width: 1200px
  display: block
  width: 100%
  min-height: 36px
  margin: 24px auto 40px auto
  border-top: 3px solid #e0e0e0

  #d-page-translation
    .q-chip
      padding: 16px 0.4em
      margin-top: 0
      margin-bottom: 0

  #d-page-nav
    &:first-child
      margin-top: calc(100vh - 200px)

    .link
      margin-top: 20px
      border: 1px solid #e0e0e0
      padding: 15px !important
</style>
