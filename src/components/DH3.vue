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

  // @ Events
  created () {
    // console.log('DH3 - created!')
  },
  mounted () {
    // console.log('DH3 - mounted!')

    this.registerAnchor(this.id)
  },
  beforeUpdate () {
    // console.log('DH3 - beforeUpdate!')
  },
  updated () {
    // console.log('DH3 - updated!')

    this.registerAnchor(this.id)
  }
}
</script>

<style lang="sass">
h3
  font-size: 1.5rem
  line-height: 1.5rem
  margin: 1em 0 0.7em

  &:first-child
    margin-top: 0
  &:before
    content: '# '
</style>
