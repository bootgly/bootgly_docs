<template lang="pug">
d-page
  header
    d-h1(:id="0")

  main
    d-page-section(:id="id")
</template>

<script>
import Subpages from 'src/pages/bootables/subpages'

export default {
  name: 'DSubpage',

  mixins: [
    Subpages
  ],

  computed: {
    id () {
      const path = this.$route.path

      let hash = 5381
      for (let i = 0; i < path.length; i++) {
        hash = (hash * 33) ^ path.charCodeAt(i)
      }

      return hash >>> 0
    }
  },

  // @ Events
  // Vue
  created () {
    // console.log('OverviewPage created!')
  },

  beforeMount () {
    // console.log('OverviewPage beforeMount!')
  },
  mounted () {
    // console.log('OverviewPage mounted!')
  },

  beforeUpdate () {
    // console.log('OverviewPage beforeUpdate!')
  },
  updated () {
    // console.log('OverviewPage updated!')
  },

  beforeUnmount () {
    // console.log('OverviewPage beforeUnmount!')
  },
  unmounted () {
    // console.log('OverviewPage unmounted!')
  },

  // Vue Router
  beforeRouteEnter () {
    // console.log('OverviewPage beforeRouteEnter!')
  },
  beforeRouteLeave () {
    // console.log('OverviewPage beforeRouteLeave!')

    this.$store.commit('page/resetAnchor')
    this.$store.commit('page/resetAnchors')
    this.$store.commit('page/resetNodes')
  },
  beforeRouteUpdate () {
    // console.log('OverviewPage beforeRouteUpdate!')
  }
}
</script>

<style scoped></style>
