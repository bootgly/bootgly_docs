<template lang="pug">
d-page(:headers="anchors")
  header
    d-h1(id="0")

  main
    template(v-for="(paragraph, id) in texts")
      d-page-section(:id="id")
</template>

<script>
import Samples from 'src/pages/bootables/subpages/samples'

export default {
  mixins: [Samples],

  computed: {
    anchors () {
      return this.$route.meta.anchors
    },
    headers () {
      const absolute = this.$store.state.i18n.absolute

      return this.$tm(`_.${absolute}.headers`)
    },
    texts () {
      const absolute = this.$store.state.i18n.absolute

      return this.$tm(`_.${absolute}.texts`)
    }
  }
}
</script>

<style scoped></style>
