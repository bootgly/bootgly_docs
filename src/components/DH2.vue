<template lang="pug">
h2(:id="id" @click="push(id)") {{ heading }}
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
    }
  },

  mounted () {
    this.registerAnchor(this.$el.id)
  }
}
</script>

<style lang="sass">
h2
  font-size: 1.7rem
  font-weight: 600
  color: #286fa3
  user-select: none
  margin: 1.5em 0 0.8em
  padding-bottom: 0.4em
  border-bottom: 1px solid #ddd

h2:hover:after
  content: ' #'
  color: #286fa3
  font-weight: bold
</style>
