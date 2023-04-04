<template lang="pug">
h1(:id="id" @click="push(id)") {{ heading }}
</template>

<script>
import Navigator from 'pages/resources/navigator'

import Header from 'pages/resources/elements/header'

export default {
  name: 'DH1',

  mixins: [
    Navigator,

    Header
  ],

  props: {
    id: {
      type: String,
      required: true
    }
  },

  mounted () {
    this.registerAnchor(this.$el.id)
  }
}
</script>

<style lang="sass">
@import 'pages/resources/elements/header.sass'

h1
  font-size: 2.1rem
  font-weight: 600
  color: #286fa3
  margin: 0 0 0.7em

h1:hover:after
  content: ' #'
  color: #286fa3
  font-weight: bold
</style>
