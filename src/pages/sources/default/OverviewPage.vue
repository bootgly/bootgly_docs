<template lang="pug">
d-page
  header
    d-h1(id="0")

  main
    template(v-for="(paragraph, id) in texts")
      d-page-section(:id="id")
</template>

<script>
import Overview from 'src/pages/resources/subpages/overview'

export default {
  mixins: [Overview],

  computed: {
    headers () {
      const absolute = this.$store.state.i18n.absolute

      return this.$tm(`_.${absolute}.headers`)
    },
    texts () {
      const absolute = this.$store.state.i18n.absolute

      return this.$tm(`_.${absolute}.texts`)
    }
  },

  // @ Events
  // Vue
  created () {
    // console.log('OverviewPage - created!')

    // this.$store.commit('page/resetNodes')
  },
  mounted () {
    // console.log('OverviewPage - mounted!')
  },
  beforeUpdate () {
    // console.log('OverviewPage - beforeUpdate!')

    // this.$store.commit('page/resetNodes')
  },
  updated () {
    // console.log('OverviewPage - updated!!')
  },
  // Vue Router
  beforeRouteLeave () {
    // console.log('OverviewPage - beforeRouteLeave!')

    this.$store.commit('page/resetNodes')
  }
}
</script>

<style scoped></style>
