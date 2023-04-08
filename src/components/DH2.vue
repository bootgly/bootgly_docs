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

  // @ Events
  created () {
    // console.log('DH2 - created!')
  },
  mounted () {
    // console.log('DH2 - mounted!')

    this.registerAnchor(this.id)
  },
  beforeUpdate () {
    // console.log('DH2 - beforeUpdate!')
  },
  updated () {
    // console.log('DH2 - updated!')

    this.registerAnchor(this.id)
  }
}
</script>

<style lang="sass">

</style>
