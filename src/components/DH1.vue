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

</style>
