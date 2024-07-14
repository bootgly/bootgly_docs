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
      img.q-mr-md(src="/images/logo/bootgly-logo-temp1.png" alt="Quasar Logo" width="85" height="85" style="float: right;")
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

  q-list(no-border link inset-delimiter role="list")
    q-item(to="/" exact)
      q-item-section(side)
        q-icon(name="home")
      q-item-section {{ $t('menu.home') }}

    li(role="listitem")
      q-separator(role="separator")
    q-item(href="https://github.com/bootgly/bootgly/releases/" target="_blank")
      q-item-section(side)
        q-icon(name="assignment")
      q-item-section {{ $t('menu.changelog') }}
      q-item-section(side)
        q-icon(name="open_in_new" size="xs")
    q-item(href="https://github.com/bootgly/bootgly/milestones" target="_blank")
      q-item-section(side)
        q-icon(name="playlist_add_check_circle")
      q-item-section {{ $t('menu.roadmap') }}
      q-item-section(side)
        q-icon(name="open_in_new" size="xs")
    q-item(href="https://github.com/sponsors/bootgly/" target="_blank")
      q-item-section(side)
        q-icon(name="favorite" color="red")
      q-item-section {{ $t('menu.sponsor') }}
      q-item-section(side)
        q-icon(name="open_in_new" size="xs")

    li(role="listitem")
      q-separator(role="separator" spaced)
      q-item-section(side).q-ml-md {{ $t('menu.explore') }}
    q-item(href="https://github.com/bootgly/bootgly_awesome/" target="_blank")
      q-item-section 🤯 Bootgly Awesome
      q-item-section(side)
        q-icon(name="open_in_new" size="xs")
    q-item(href="https://github.com/bootgly/bootgly_benchmarks/" target="_blank")
      q-item-section ⏱️ Bootgly Benchmarks (WIP)
      q-item-section(side)
        q-icon(name="open_in_new" size="xs")

  q-separator.separator.list

  q-list(v-if="items !== null && items.constructor === Array && items.length > 0"
    no-border link inset-delimiter role="list"
  )
    template(v-for="(item, index) in items" :key="index")
      //- TODO: save state of opened items to localStorage?
      q-expansion-item.menu-list-expansion(
        v-if="item && item.constructor === Array"
        expand-separator
        default-opened
      )
        template(v-slot:header)
          q-item-section
            div.row.justify-center.text-center
              div.col
                q-icon(:name="item[0].meta.menu.header.icon" size="1.5rem")
                span.q-ml-md
                  | {{ getMenuItemHeaderLabel(item[0].meta) }}
        template(v-for="(subitem, subindex) in item" :key="subindex")
          d-menu-item(
            :items="items.length"
            :subitem="subitem"
            :subindex="subindex"
            :subpage="subpage"
            :founds="founds"
          )
      d-menu-item(v-else-if="item && item.constructor === Object"
        :items="items.length"
        :subitem="item"
        :subindex="index"
        :subpage="subpage"
        :founds="founds"
      )
</template>

<script>
import { openURL, scroll } from 'quasar'

import tags from 'src/i18n/tags.hjson'

import DMenuItem from "./DMenuItem.vue";

export default {
  name: 'DMenu',

  components: {
    DMenuItem
  },
  data () {
    return {
      loaded: false,
      scrolling: null,

      term: null,
      founds: false,

      version: 'v0.x',
      versions: [
        'v0.x'
      ]
    }
  },
  computed: {
    subpage () {
      const parent = this.$route.matched[0]?.path
      const child = this.$route.matched[1]?.path

      const subpage = child.substring(parent.length)

      return subpage
    }
  },

  methods: {
    openURL,

    // TODO: highlight terms found in menu item and page content?
    // TODO: search result count in input bottom?
    searchTerm (term) {
      if (term.length > 1) {
        term = term.toLowerCase()

        const locale = this.$q.localStorage.getItem('setting.language')

        this.founds = []

        for (const [index, items] of this.items.entries()) {
          this.searchTermIterate(items, term, locale)
        }
      } else {
        this.founds = false
      }
    },
    searchTermIterate (items, term, locale) {
      if (items.constructor === Array) {
        for (const subitems of items) {
          this.searchTermIterate(subitems, term, locale)
        }
      } else if (items.constructor === Object) {
        const item = items
        const path = item.path

        this.founds[path] = false

        // TODO: search in Menu item label

        // @ search in i18n/tags.json
        // current language
        if (tags[locale].length > 0) {
          this.founds[path] = tags[locale][index].indexOf(term) !== -1
          // en-US fallback
          if (this.founds[path] === false && locale !== 'en-US') {
            this.founds[path] = tags['en-US'][index].indexOf(term) !== -1
          }
        }

        // @ search in Page content
        if (this.founds[path] === false) {
          // @ search in Page texts (overview, showcases?, changelog?)
          // current language
          this.founds[path] = this.searchTermInI18nTexts(path, term, locale)
          // en-US fallback
          if (this.founds[path] === false && locale !== 'en-US') {
            this.founds[path] = this.searchTermInI18nTexts(path, term, 'en-US')
          }
        }
      }
    },
    searchTermInI18nTexts (route, term, locale) {
      // TODO: use global constants
      const subpages = [
        'overview',
        'showcase',
        'vs'
      ]

      let source = null
      let found = false
      for (const subpage of subpages) {
        // TODO: replace with global solution
        const path = `_${route.replace(/_$/, '').replace(/\//g, '.')}.${subpage}.source`
        // * Search in page texts (i18n)
        source = null
        const msgExists = this.$te(path, locale)
        if (msgExists) {
          source = this.$tm(path, locale)
        }

        if (msgExists && source.toLowerCase().includes(term)) {
          found = true
          break
        }
      }

      return found
    },
    clearSearchTerm () {
      this.term = ''
      this.searchTerm('')
      return true
    },

    // _ Item
    getMenuItemHeaderLabel (meta) {
      const label = meta.menu.header.label

      if (label[0] === '.') { // Node path
        const path = `_.${meta.type}${label}._`

        if (this.$te(path)) {
          return this.$t(path)
        }

        return this.$t(path, 'en-US')
      }

      return label // String raw
    },

    scrollToActiveMenuItem () {
      if (this.scrolling) {
        clearTimeout(this.scrolling)
      }

      this.scrolling = setTimeout(() => {
        console.log('scrolling...')
        const menu = document.getElementById('menu')
        if (menu) {
          const menuItemActive = (menu.getElementsByClassName('q-router-link--active'))[0]
          if (menuItemActive && typeof menuItemActive === 'object') {
            const offsetTop1 = menuItemActive.closest('.menu-list-expansion')?.offsetTop ?? 0
            const offsetTop2 = menuItemActive.offsetTop

            const innerHeightBy2 = window.innerHeight / 2

            const searchBarHeight = 50
            let expansionHeaderHeight = 0
            if (offsetTop1 > 0) {
              expansionHeaderHeight = 45
            }
            const fixedHeight = searchBarHeight + expansionHeaderHeight

            const target = scroll.getScrollTarget(menuItemActive)
            const offset = (offsetTop1 + offsetTop2) - innerHeightBy2 + fixedHeight
            const duration = 300

            if (offset > 0) {
              scroll.setVerticalScrollPosition(target, offset, duration)
            }
          }
        }
        this.scrolling = null
      }, 1500)
    }
  },

  // # Events
  // Create
  beforeCreate () {
    // console.log('DMenu - beforeCreate()!')

    const routes = this.$router.options.routes.slice(0, -2) // Delete last 2 routes
    const items = []

    let nodeBasepath = ''
    let nodeIndex = 0
    for (const [index, route] of routes.entries()) {
      const item = Object.freeze({
        path: route.path,
        meta: route.meta
      })
      // # Route
      const basepath = route.path.split('/')[2]
      const header = route.meta.menu.header

      if (header !== undefined && basepath !== nodeBasepath) {
        nodeBasepath = basepath
        nodeIndex = index
        items[index] = []
      } else if (header === undefined && basepath !== nodeBasepath) {
        nodeBasepath = ''
      }

      if (nodeBasepath !== '') {
        items[nodeIndex].push(item)
      } else {
        items.push(item)
      }
    }

    this.items = Object.freeze(items.filter(item => item !== undefined))
  },
  // Mount
  mounted () {
    // console.log('DMenu - mounted()!')

    // ! Autoscrolling to active menu item after 1.5s
    this.scrollToActiveMenuItem()

    // * After each route change
    this.$router.afterEach((to, from) => {
      if (!to.hash || (from.path !== to.path)) {
        this.scrollToActiveMenuItem()
      }
    })
  },
  beforeUnmount () {
    // console.log('DMenu - beforeUnmount()!')

    if (this.scrolling) {
      clearTimeout(this.scrolling)
    }
  }
}
</script>

<style lang="sass">
body.body--dark
  --d-menu-subheader-txt-color: #a8a8a8
  --d-menu-expansion-bg-color: rgb(48, 48, 48)
  --d-menu-item-opacity: 0.03
body.body--light
  --d-menu-subheader-txt-color: #363636
  --d-menu-expansion-bg-color: rgb(245, 245, 245)
  --d-menu-item-opacity: 0.015

#menu
  width: 100%
  height: calc(100% - 50px)

  // List
  .q-list
    padding: 8px 0

    .menu-list-expansion
      box-shadow: 0px -1px 3px rgba(0, 0, 0, 0.2), 0 1px 1px rgba(0, 0, 0, 0.14), 0 2px 1px -1px rgba(0, 0, 0, 0.12)
      margin-top: 5px

      .q-item[role="button"]
        position: sticky
        position: -webkit-sticky
        position: -moz-sticky
        position: -ms-sticky
        position: -o-sticky
        width: 100%
        top: -1px
        z-index: 3
        background-color: var(--d-menu-expansion-bg-color)
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2), 0 1px 1px rgba(0, 0, 0, 0.14), 0 2px 1px -1px rgba(0, 0, 0, 0.12)

      .separator
        margin: 0 auto

    // List Item
    .q-item
      padding: 8px 12px
      min-height: 45px
      margin-bottom: 2px
      &.q-hoverable > .q-focus-helper
        background-color: currentColor
        opacity: var(--d-menu-item-opacity)
      &.q-hoverable:hover > .q-focus-helper
        background-color: currentColor
        opacity: 0.15 !important

    // List Item Section
    .q-item.q-router-link--active
      color: black
      background-color: rgba(189, 189, 189, 0.7)
      // List Item Section
      .q-item__section--side:not(.q-item__section--avatar)
          .q-icon
            color: black

  .page-status
    margin-right: 7px

  // List Item Label
  .label
    color: var(--d-menu-subheader-txt-color)

    &.header
      text-align: center
      min-height: 32px
      > div
        padding-bottom: 7px
        padding-top: 10px

      .q-icon
        padding-right: 5px
    &.subheader
      text-align: left
      padding-bottom: 5px
      padding-left: 10px
    span
      color: #363636

  // List Item Separator
  li
    display: block
  .separator
    margin: 5px 0
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
