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
  margin: 1.2em 0 0.9em

  &:first-child
    margin-top: 0
  &:before
    content: '# '
</style>
