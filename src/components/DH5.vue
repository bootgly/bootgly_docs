<template lang="pug">
h5(:id="id" @click="push(id)") {{ value }}
</template>

<script>
import Navigator from 'pages/resources/navigator'

import Header from 'pages/resources/elements/header'

export default {
  name: 'DH5',

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
    this.registerAnchor(this.id, this.value)
  }
}
</script>

<style lang="sass">
h5
  font-size: 1.12rem
  margin: 0.5em 0 0.3em
</style>
