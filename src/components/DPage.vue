<template lang="pug">
q-page-container#page
  q-toolbar#submenu.bg-grey-8.text-white(v-if="overview && (samples)")
    q-toolbar-title.toolbar-container
      q-btn-group(v-bind:class="$q.screen.lt.md ? 'mobile' : null")
        q-btn(v-if="overview"
          no-caps flat
          v-bind:class="pActive('/')"
          :label="$t('submenu.overview')" icon="pageview"
          @click="pRoute('/')"
        )
        q-btn(v-if="samples"
          no-caps flat
          v-bind:class="pActive('/samples')"
          :label="$t('submenu.samples')" icon="play_circle_filled"
          @click="pRoute('/samples')"
        )

  q-page(style="min-height: calc(100vh - 80px)")
    q-scroll-area.content(:class="main")
      slot
      d-page-nav(v-if="!disableNav")
      q-scroll-observer(v-if="nodes.length > 0" @scroll="scrolling" :debounce="300")

  q-drawer(elevated show-if-above side="right" v-model="layoutMeta")
    d-page-anchor#anchor(v-if="nodes.length > 0" :nodes="nodes")
</template>

<script>
import DPageAnchor from 'components/DPageAnchor'
import DPageNav from 'components/DPageNav'

import Navigator from 'pages/bootables/navigator'

export default {
  name: 'DPage',

  components: {
    DPageAnchor,
    DPageNav
  },

  mixins: [Navigator],

  props: {
    disableNav: {
      type: Boolean,
      default: false
    }
  },

  computed: {
    nodes () {
      const nodes = this.$store.state.page.nodes
      return nodes
    },

    overview () {
      return this.$route.matched[0].path
    },
    samples () {
      if (this.$route.matched[0].meta.subpages.samples !== false) {
        return this.overview + '/samples'
      }
      return false
    },

    // Set CSS classes
    layoutMeta: {
      get () {
        return this.$store.state.layout.meta
      },
      set (value) {
        this.$store.commit('layout/setMeta', value)
      }
    },
    main () {
      let classes = ''

      switch (this.$store.state.page.relative) {
        case '/samples':
          classes = 'samples'
          break
        default:
          classes = 'overview'
      }

      return classes
    }
  },

  methods: {
    pActive (relative) {
      if (relative === '/' && (this.$store.state.page.relative === relative || this.$store.state.page.relative === '')) {
        return 'active'
      } else if (this.$store.state.page.relative === relative) {
        return 'active'
      }

      return null
    },
    pRoute (to) {
      const base = '/' + this.$store.state.page.base
      const relative = this.$store.state.page.relative
      let path = base

      if (to !== '/') {
        path += to
      }

      if (relative === to) {
        if (to !== '/samples') {
          return this.push('0')
        } else {
          return this.push('1')
        }
      }

      this.$router.push(path)

      return true
    }
  }
}
</script>

<style lang="sass">
.content,
.content > div.scroll
  min-height: calc(100vh - 80px)
.content:not(.no-padding) > div.scroll > div.q-scrollarea__content
  padding: 20px

#submenu
  min-height: 36px
  padding: 0
  box-shadow: 0 2px 4px -1px rgba(0,0,0,0.2), 0 4px 5px rgba(0,0,0,0.14), 0 1px 6px rgba(0,0,0,0.12)
  overflow: visible

  .toolbar-container
    overflow: visible
  .q-btn-group
    box-shadow: none
    &.mobile
      .q-btn-inner
        div
          display: none
  .q-btn-inner
    .q-icon
      margin: 0
    div
      &:not(.focus-helper)
        margin-left: 6px

#submenu a,
#submenu button
  border-radius: 0
  padding: 6px 12px

// * Coloring
// Light
body.body--light
  #submenu a.active,
  #submenu button.active
    background-color: #fff !important
    color: #000
    box-shadow: 0 10px 0 0 #fff
// Dark
body.body--dark
  #submenu a.active,
  #submenu button.active
    background-color: #000 !important
    color: #fff
    box-shadow: 0 10px 0 0 #000
</style>
