<template lang="pug">
h3(:id="id" @click="push(id)") {{ value }}
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
h3
  font-size: 1.5rem
  margin: 1.0em 0 0.7em

  &:first-child
    margin-top: 0
  &:before
    content: '# '
</style>
