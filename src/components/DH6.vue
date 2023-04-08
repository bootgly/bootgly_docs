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

  // @ Events
  created () {
    // console.log('DH6 - created!')
  },
  mounted () {
    // console.log('DH6 - mounted!')

    this.registerAnchor(this.id)
  },
  beforeUpdate () {
    // console.log('DH6 - beforeUpdate!')
  },
  updated () {
    // console.log('DH6 - updated!')

    this.registerAnchor(this.id)
  }
}
</script>

<style lang="sass">
h6
  font-size: 1.06rem
  line-height: 1.06rem
  margin: 0.3em 0 0.1em
</style>
