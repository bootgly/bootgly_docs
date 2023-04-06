<template lang="pug">
transition(appear enter-active-class="animated zoomIn" leave-active-class="animated zoomOut")
  q-input(for="search" v-model="term" @update:model-value="searchTerm" :placeholder="$t('menu.search')" :debounce="300")
    template(v-slot:prepend)
      q-icon.q-ml-sm(name="search")
    template(v-slot:append)
      q-icon.cursor-pointer.clear(v-if="term" name="clear" @click="clearSearchTerm")
q-scroll-area#menu(
  :visible="true"
  :class="$q.dark.isActive ? ``: `bg-grey-2`"
)
  .row.flex-center(:class="$q.dark.isActive ? `bg-dark` : `bg-white`" style="height: 115px;")
    .col-5
      img.q-mr-md(src="logo/bootgly-logo-temp1.png" alt="Quasar Logo" width="85" height="85" style="float: right;")
    .col-7
      .text-weight-medium Bootgly PHP Framework
      .text-caption.q-pt-xs {{ $t('system.documentation') }}
      q-select.q-mr-md(
        v-model="version" :options="versions"
        dense options-dense
        behavior="menu"
      )

  q-separator.separator.list
  .row(:class="$q.dark.isActive ? `bg-dark` : `bg-white`")
    .col.text-center
      q-btn-group(flat)
        q-btn(icon="fab fa-github" size="sm" @click="openURL('https://github.com/bootgly/bootgly-php-framework/')" aria-label="Bootgly Github")
          q-tooltip Github
        q-btn(icon="fas fa-comments" size="sm" @click="openURL('https://github.com/bootgly/bootgly-php-framework/discussions/')" aria-label="Bootgly Forum")
          q-tooltip Discussions
        q-btn(icon="fas fa-comment" size="sm" @click="openURL('https://t.me/bootgly/')" aria-label="Bootgly Chat")
          q-tooltip Chat
        q-btn(icon="fas fa-at" size="sm" @click="openURL('mailto:public@bootgly.com')" aria-label="Bootgly Public Email")
          q-tooltip Email
  q-separator.separator.list
  q-list(no-border link inset-delimiter)
    q-item(to="/" exact)
      q-item-section(side)
        q-icon(name="home")
      q-item-section {{ $t('menu.home') }}
    q-item(to="/changelog")
      q-item-section(side)
        q-icon(name="assignment")
      q-item-section {{ $t('menu.changelog') }}
    q-item(to="/sponsor")
      q-item-section(side)
        q-icon(name="favorite" color="red")
      q-item-section {{ $t('menu.sponsor') }}
  q-separator.separator.list
  q-list(v-if="items !== null && items.constructor === Array && items.length > 0" no-border link inset-delimiter)
    template(v-for="(item, index) in items" :key="index")
      q-item-section.label.header.sticky(v-if="item.meta.menu.header" :style="getMenuItemHeaderBackground()")
        q-item-label(header)
          q-icon(:name="item.meta.menu.header.icon" size="1.5rem")
          | {{ getMenuItemHeader(item) }}
        q-separator.separator.partial

      q-item-section(v-if="item.meta.menu.subheader")
        q-item-label.label.subheader(header) {{ getMenuItemSubheader(item) }}

      q-item(:to="item.path" v-show="matches[index] || !matches")
        q-item-section(side)
          q-icon(v-if="item.meta.icon" :name="item.meta.icon")
        q-item-section {{ getMenuItemLabel(item, index) }}
        q-item-section.page-status(v-if="item.meta.status !== 'done'" side)
          q-badge(
            :text-color="getPageStatusTextColor(item.meta.status)"
            :color="getPageStatusColor(item.meta.status)"
            :label="getPageStatusText(item.meta.status)"
          )
          q-tooltip(:hide-delay="3") {{ getPageStatusTooltip(item.meta.status) }}
      q-separator(v-if="item.meta.menu.separator" :class="'separator' + item.meta.menu.separator")
</template>

<script>
import { openURL, scroll } from 'quasar'
const { getScrollTarget, setVerticalScrollPosition } = scroll

import tags from 'src/i18n/tags.hjson'

export default {
  name: 'DMenu',

  data () {
    return {
      loaded: false,

      term: null,
      matches: false,

      version: 'v0.x',
      versions: [
        'v0.x'
      ]
    }
  },
  computed: {},

  methods: {
    openURL,

    // TODO highlight terms found in menu item and page content?
    // TODO search result count in input bottom?
    searchTerm (term) {
      if (term.length > 1) {
        term = term.toLowerCase()

        const locale = this.$q.localStorage.getItem('setting.language')

        this.matches = []

        for (const [index, route] of this.items.entries()) {
          // ! Search in Menu item label
          // TODO

          // @ Search in i18n/tags.json
          // Current language
          this.matches[index] = false
          if (tags[locale].length > 0) {
            this.matches[index] = tags[locale][index].indexOf(term) !== -1
            // en-US fallback
            if (this.matches[index] === false && locale !== 'en-US') {
              this.matches[index] = tags['en-US'][index].indexOf(term) !== -1
            }
          }

          // @ Search in Page content
          if (this.matches[index] === false) {
            // ? Search in Page texts (overview, samples?, changelog?)
            // Current language
            this.matches[index] = this.searchTermInI18nTexts(route.path, term, locale)
            // en-US fallback
            if (this.matches[index] === false && locale !== 'en-US') {
              this.matches[index] = this.searchTermInI18nTexts(route.path, term, 'en-US')
            }
          }
        }
      } else {
        this.matches = false
      }
    },
    searchTermInI18nTexts (route, term, locale, subpage = 'overview') {
      // TODO replace with global solution
      const path = `_${route.replace(/_$/, '').replace(/\//g, '.')}.${subpage}.texts`

      // * Search in page texts (i18n)
      let texts = null
      if (this.$te(path, locale)) {
        texts = this.$tm(path, locale)
      }

      let found = false
      if (texts && Object.keys(texts).length) {
        for (const text of texts) {
          if (text.toLowerCase().includes(term)) {
            found = true
            break
          }
        }
      }

      return found
    },
    clearSearchTerm () {
      this.term = ''
      this.searchTerm('')
      return true
    },

    getMenuItemHeaderBackground () {
      return this.$q.dark.isActive ? '' : 'background-color: #f5f5f5!important'
    },
    getMenuItemHeader (item) {
      const path = `_.${item.meta.menu.header.name}._`

      if (this.$te(path)) {
        return this.$t(path)
      } else {
        return this.$t(path, 'en-US')
      }
    },
    getMenuItemSubheader (item) {
      const path = `_.${item.meta.menu.subheader}._`

      if (this.$te(path)) {
        return this.$t(path)
      } else {
        return this.$t(path, 'en-US')
      }
    },
    getMenuItemLabel (item, index) {
      // if (this.loaded) return

      if (index === this.items.length - 1) {
        this.loaded = true
      }

      const path = `_${item.path.replace(/_$/, '').replace(/\//g, '.')}._`
      // console.log(path)
      // TODO fix re-render at menu scrolling?! Lol
      if (this.$te(path)) {
        return this.$t(path)
      } else {
        return this.$t(path, 'en-US')
      }
    },

    getPageStatusText (status) {
      if (status === 'draft') {
        return this.$t('menu.status.draft._')
      } else {
        return this.$t('menu.status.empty._')
      }
    },
    getPageStatusTextColor (status) {
      if (status === 'draft') {
        return 'dark'
      } else {
        return 'red'
      }
    },
    getPageStatusColor (status) {
      if (status === 'draft') {
        return 'orange'
      } else {
        return 'red'
      }
    },
    getPageStatusTooltip (status) {
      if (status === 'draft') {
        return this.$t('menu.status.draft.tooltip')
      } else {
        return this.$t('menu.status.empty.tooltip')
      }
    },

    scrollToActiveMenuItem () {
      const menu = document.getElementById('menu')

      if (menu) {
        const menuItemActive = (menu.getElementsByClassName('q-router-link--active'))[0]

        if (menuItemActive && typeof menuItemActive === 'object') {
          const target = getScrollTarget(menuItemActive)
          const offset = menuItemActive.offsetTop
          const duration = 300

          // TODO fix tremor
          // TODO detect scrollarea scroll position and only setVertical in initial position (top = 0)
          setVerticalScrollPosition(target, offset - (window.innerHeight / 2) + 80, duration)
        }
      }
    }
  },

  // @ Events
  beforeCreate () {
    // console.log('DMenu - beforeCreate()!')

    const routes = this.$router.options.routes.slice(0, -1) // Delete last route
    const items = []

    for (const [index, route] of routes.entries()) {
      items[index] = Object.freeze({
        path: route.path,
        meta: {
          icon: route.meta.icon,
          menu: route.meta.menu,
          status: route.meta.status
        }
      })
    }

    this.items = Object.freeze(items)

    // console.log(this.items, routes)
  },
  created () {
    // console.log('DMenu - created()!')
  },
  beforeMount () {
    // console.log('DMenu - beforeMount()!')
  },
  mounted () {
    // console.log('DMenu - mounted()!')

    // ! Autoscrolling to active menu item after 1.5s
    setTimeout(() => {
      this.scrollToActiveMenuItem()
    }, 1500)
    // * After each route change
    this.$router.afterEach((to, from) => {
      if (!to.hash || (from.path !== to.path)) {
        setTimeout(() => {
          this.scrollToActiveMenuItem()
        }, 1500)
      }
    })

    // console.log(this.items)
  },
  beforeUpdate () {
    // console.log('DMenu - beforeUpdate()!')
  },
  updated () {
    // console.log('DMenu - updated()!')
  }
}
</script>

<style lang="sass">
#menu
  width: 100%
  height: calc(100% - 50px)

  // List
  .q-list
    padding: 8px 0
    // List Item
    .q-item
      padding: 8px 12px
      min-height: 45px
    // List Item Section
    .q-item.q-router-link--active
      color: black
      background: rgba(189, 189, 189, 0.7)
      // List Item Section
      .q-item__section--side:not(.q-item__section--avatar)
          .q-icon
            color: black

  .page-status
    margin-right: 7px

  // List Item Label
  .label
    color: #363636

    &.header
      text-align: center
      min-height: 32px
      > div
        padding-bottom: 7px
        padding-top: 10px
      &.sticky
        position: sticky
        position: -webkit-sticky
        position: -moz-sticky
        position: -ms-sticky
        position: -o-sticky
        width: 100%
        top: -1px
        margin-bottom: 5px
        z-index: 2
        .separator
          margin: 0 auto

      .q-icon
        padding-right: 5px
    &.subheader
      text-align: left
      padding-bottom: 5px
      padding-left: 10px
    span
      color: #363636

  // List Item Separator
  .separator
    &.list
      height: 3px
      margin: 0
    &.page
      height: 3px
    &.subpage
      height: 1px
    &.partial
      margin: 3px auto
      width: 30px
      height: 3px

// Search
label[for="search"]
  z-index: 2

  .q-field__control,
  .q-field__marginal
    height: 50px

  i.clear
    padding: 13px 8px
</style>
