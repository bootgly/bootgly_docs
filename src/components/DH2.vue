<template lang="pug">
h2(:id="id" @click="push(id)") {{ value }}
</template>

<script>
import Navigator from 'pages/resources/navigator'

import Header from 'pages/resources/elements/header'

export default {
  name: 'DH2',

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
h2
  font-size: 1.7rem
  margin: 1.5em 0 0.8em
  padding-bottom: 0.4em
  border-bottom: 1px solid #ddd
</style>
