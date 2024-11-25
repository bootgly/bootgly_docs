<script setup>
import { ref, defineProps, computed, onMounted } from 'vue'
import { useStore } from 'vuex'
import { useRouter, useRoute } from 'vue-router'
import { scroll, useQuasar } from 'quasar'

import DPageAnchor from 'components/DPageAnchor'
import DPageMeta from 'components/DPageMeta'

const store = useStore()
const router = useRouter()
const route = useRoute()
const $q = useQuasar()

const props = defineProps({
  disableNav: {
    type: Boolean,
    default: false
  }
})

const pageScrollArea = ref(null)

const overview = computed(() => route.matched[0].path)
const showcase = computed(() => {
  const showcase = route.matched[0].meta.subpages.showcase
  return showcase ? overview.value + '/showcase' : false
})
const vs = computed(() => {
  const vs = route.matched[0].meta.subpages.vs
  return vs ? overview.value + '/vs' : false
})
const layoutMeta = computed({
  get: () => store.state.layout.meta,
  set: (value) => store.commit('layout/setMeta', value)
})
const main = computed(() => {
  switch (store.state.page.relative) {
    case '/showcase':
      return 'showcase'
    case '/vs':
      return 'vs'
    default:
      return 'overview'
  }
})

const toggleSectionsTree = () => {
  layoutMeta.value = !layoutMeta.value
}

const pActive = (relative) => {
  if (relative === '/' && (store.state.page.relative === relative || store.state.page.relative === '')) {
    return 'active'
  } else if (store.state.page.relative === relative) {
    return 'active'
  }
  return null
}

const subroute = (to) => {
  const base = '/' + store.state.page.base
  const relative = store.state.page.relative
  let path = base

  if (to !== '/') {
    path += to
  }

  if (relative === to) {
    if (to !== '/showcase') {
      return push('0')
    } else {
      return push('1')
    }
  }

  router.push(path)
  return true
}

const resetPageScroll = () => {
  if (pageScrollArea.value !== null) {
    pageScrollArea.value.setScrollPosition('vertical', 0, 0)
  }
}

const register = (id) => {
  store.commit('page/pushAnchors', id)
}

const index = (id, child = false) => {
  store.commit('page/pushNodes', {
    id,
    label: this.value,
    child,
    children: []
  })
}

const anchor = (id, select = true) => {
  store.commit('page/setScrolling', false)
  id = '' + id
  const Anchor = document.getElementById(id)
  if (Anchor !== null && typeof Anchor === 'object') {
    const ScrollTarget = scroll.getScrollTarget(Anchor)
    const AnchorOffsetTop = Anchor.offsetTop
    scroll.setVerticalScrollPosition(ScrollTarget, AnchorOffsetTop, 300)
    setTimeout(() => {
      store.commit('page/setScrolling', true)
    }, 600)
  }
  if (select) {
    selectAnchor(id)
  }
}

const selectAnchor = (id) => {
  store.commit('page/setAnchor', Number(id))
  store.commit('page/pushNodesExpanded', Number(id))
}

const scrolling = (scroll) => {
  const scrolling = store.state.page.scrolling
  if (!scrolling) {
    return
  }
  const scrollPositionTop = scroll.position.top + 50
  const anchors = store.state.page.anchors
  for (let i = 0; i < anchors.length; i++) {
    const anchorId = anchors[i]
    if (anchorId === 0) {
      continue
    }
    const Anchor = document.getElementById(anchorId)
    let AnchorOffsetTop = 20
    if (Anchor !== null && typeof Anchor === 'object') {
      AnchorOffsetTop = Anchor.offsetTop
    }
    if (scrollPositionTop >= AnchorOffsetTop) {
      selectAnchor(anchorId)
    }
  }
}

const navigate = (value, anchor = true) => {
  if (anchor) {
    if (('#' + value) === route.hash) {
      anchor(value)
      return
    } else if (value === null) {
      anchor(selected.value, false)
      return
    }
  }
  router.push(route.path + '#' + value)
  if (anchor) {
    if ($q.platform.is.desktop) {
      anchor(value)
    } else {
      setTimeout(() => {
        anchor(value)
      }, 600)
    }
  }
}

onMounted(() => {
  router.beforeEach((to, from, next) => {
    resetPageScroll()
    if (to.hash === '' && from.path !== to.path) {
      store.commit('page/resetAnchor')
      store.commit('page/resetAnchors')
      store.commit('page/resetNodes')
    }
    next()
  })
})
</script>

<template lang="pug">
q-page-container#page-container
  q-toolbar#submenu.bg-grey-8.text-white
    q-toolbar-title.toolbar-container
      q-btn-group(v-bind:class="$q.screen.lt.md ? 'mobile' : null")
        q-btn(v-if="overview && (showcase || vs)"
          no-caps flat
          v-bind:class="pActive('/overview')"
          :label="$t('submenu.overview')" icon="pageview"
          @click="subroute('/overview')")
        q-btn(v-if="showcase"
          no-caps flat
          v-bind:class="pActive('/showcase')"
          :label="$t('submenu.showcase')" icon="play_circle_filled"
          @click="subroute('/showcase')")
        q-btn(v-if="vs"
          no-caps flat
          v-bind:class="pActive('/vs')"
          :label="$t('submenu.versus')" icon="compare"
          @click="subroute('/vs')")
    q-btn(@click="toggleSectionsTree" icon="account_tree")

  q-page#page
    q-scroll-area.content(:class="main" ref="pageScrollArea")
      #scroll-container
        slot
      d-page-meta(v-if="!disableNav")
      q-scroll-observer(@scroll="scrolling" :debounce="300")
      //-q-page-sticky(v-if="getScrollPositionTop > 1" position="right" :offset="[18, 0]")
        q-btn(
          round push
          :aria-label="$t('system.backToTop')" color="primary" icon="arrow_upward"
          @click="backToTop")

  q-drawer(elevated show-if-above side="right" v-model="layoutMeta")
    d-page-anchor#anchor
</template>

<style lang="sass">
#page-container
  padding-bottom: 0 !important

.content,
.content > div.scroll
  min-height: calc(100vh - 86px)

.content:not(.no-padding) > div.scroll > div.q-scrollarea__content
  padding: 15px

#page
  min-height: calc(100vh - 86px) !important

#scroll-container
  max-width: 1200px
  margin: auto

#submenu
  min-height: 36px
  padding: 0
  box-shadow: 0 2px 4px -1px rgba(0,0,0,0.2), 0 4px 5px rgba(0,0,0,0.14), 0 1px 6px rgba(0,0,0,0.12)
  overflow: visible

  .on-left
    margin-right: 5px
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
    background-color: var(--q-dark-page) !important
    color: #fff
    box-shadow: 0 10px 0 0 var(--q-dark-page)

body.mobile.body--dark
  .q-drawer--right
    background: rgba(18, 0, 0, 0.7)
body.mobile
  .q-drawer--right
    background: rgba(255, 255, 255, 0.7)
</style>
