<template lang="pug">
d-page
  header
    d-h1(id="0")

  main
    d-page-section(:id="0")
</template>

<script>
import Overview from 'src/pages/bootables/subpages/overview'

export default {
  mixins: [Overview],

  // @ Events
  // Vue
  created () {
    // console.log('OverviewPage.created!')

    // this.$store.commit('page/resetNodes')
  },

  beforeMount () {
    // console.log('OverviewPage.beforeMount!')
  },
  mounted () {
    // console.log('OverviewPage.mounted!')
  },

  beforeUpdate () {
    // console.log('OverviewPage.beforeUpdate!')

    // this.$store.commit('page/resetNodes')
  },
  updated () {
    // console.log('OverviewPage.updated!')
  },
  // Vue Router
  beforeRouteLeave () {
    // console.log('OverviewPage.beforeRouteLeave!')

    this.$store.commit('page/resetNodes')
  }
}
</script>

<style scoped></style>
