<template lang="pug">
h1(:id="id" @click="navigate(id)" v-html="heading")
</template>

<script>
import Navigator from 'pages/resources/navigator'

export default {
  name: 'DH1',

  mixins: [
    Navigator
  ],

  props: {
    id: {
      type: String,
      required: true
    }
  },
  computed: {
    heading () {
      const base = this.$store.state.i18n.base
      const absolute = this.$store.state.i18n.absolute

      let h = ''
      if (base && absolute) {
        if (this.id === '0') {
          h = this.$t(`_.${base}._`)
        } else {
          h = this.$t(`_.${absolute}.headers[${this.id - 1}]`)
        }
      } else {
        // TODO exception?
      }

      return h
    }
  },

  // @ Events
  mounted () {
    // console.log('DH1.mounted!')

    this.register()
  },

  updated () {
    // console.log('DH1.mounted!')

    this.register()
  }
}
</script>

<style lang="sass">

</style>
