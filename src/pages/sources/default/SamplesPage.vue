<template lang="pug">
d-page(:headers="anchors")
  header
    d-h1(id="0")

  main
    template(v-for="(paragraph, id) in texts")
      d-h1(:id="id" v-if="id !== 0")
      d-page-section(:id="id")
</template>

<script>
import Samples from 'src/pages/resources/subpages/samples'

export default {
  mixins: [Samples],

  data () {
    return {
      anchors: [],
      headers: [],
      texts: []
    }
  },
  mounted () {
    // Meta
    this.anchors = this.$route.meta.anchors
    // i18n
    // const relative = this.$store.state.i18n.relative
    const absolute = this.$store.state.i18n.absolute

    this.headers = this.$tm(`_.${absolute}.headers`)
    this.texts = this.$tm(`_.${absolute}.texts`)
  }
}
</script>

<style scoped></style>
