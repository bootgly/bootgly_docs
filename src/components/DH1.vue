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
    this.registerAnchor(this.id)
  }
}
</script>

<style lang="sass">
@import 'pages/resources/elements/header.sass'

h1
  font-size: 2.1rem
  margin: 0 0 0.7em
</style>
