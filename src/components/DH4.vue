<template lang="pug">
h4(:id="id" @click="push(id)") {{ value }}
</template>

<script>
import Navigator from 'pages/resources/navigator'

import Header from 'pages/resources/elements/header'

export default {
  name: 'DH4',

  mixins: [
    Navigator,

    Header
  ],

  props: {
    id: {
      type: String,
      required: true
    },
    value: {
      type: String,
      required: true
    }
  },

  mounted () {
    this.$store.commit('page/setNode', {
      id: this.id,
      label: this.value,
      children: []
    })

    this.registerAnchor(this.id)
  }
}
</script>

<style lang="sass">
h4
  font-size: 1.25rem
  margin: 0
</style>
