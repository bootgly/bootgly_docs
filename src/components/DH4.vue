<template lang="pug">
h4(:id="id" @click="push(id)") {{ value }}
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
    },
    value: {
      type: String,
      required: true
    }
  },

  // @ Events
  created () {
    // console.log('DH4 - created!')
  },
  mounted () {
    // console.log('DH4 - mounted!')

    this.registerAnchor(this.id)
  },
  beforeUpdate () {
    // console.log('DH4 - beforeUpdate!')
  },
  updated () {
    // console.log('DH4 - updated!')

    this.registerAnchor(this.id)
  }
}
</script>

<style lang="sass">

</style>
