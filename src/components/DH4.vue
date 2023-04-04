<template lang="pug">
h4(:id="id" @click="push(id)") {{ heading }}
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
    }
  },

  mounted () {
    this.registerAnchor(this.$el.id)
  }
}
</script>

<style lang="sass">
h4
  font-size: 1.25rem
</style>
