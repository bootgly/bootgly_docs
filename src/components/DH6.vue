<template lang="pug">
h6(:id="id" @click="push(id)") {{ value }}
</template>

<script>
import Navigator from 'pages/resources/navigator'

import Header from 'pages/resources/elements/header'

export default {
  name: 'DH6',

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
h6
  font-size: 1.06rem
  margin: 0.3em 0 0.1em
</style>
