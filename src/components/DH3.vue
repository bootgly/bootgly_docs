<template lang="pug">
h3(:id="id" @click="push(id)") {{ heading }}
</template>

<script>
import Navigator from 'pages/resources/navigator'

import Header from 'pages/resources/elements/header'

export default {
  name: 'DH3',

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
h3
  font-size: 1.5rem
  font-weight: 600
  color: #286fa3
  user-select: none
  margin: 1.2em 0 0.9em
  &:first-child
    margin-top: 0
  &:before
    content: '# '

h3:hover:after
  content: ' #'
  color: #286fa3
  font-weight: bold
</style>
