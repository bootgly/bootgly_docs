<template lang="pug">
h2(:id="id" @click="navigate(id)" v-html="value")
</template>

<script>
import Navigator from 'pages/bootables/navigator'

export default {
  name: 'DH2',

  mixins: [
    Navigator
  ],

  props: {
    id: {
      type: Number,
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
    // console.log('DH2.mounted!')

    this.register()

    this.index()
  },

  beforeUpdate () {
    // console.log('DH2 - beforeUpdate!')
  },
  updated () {
    // console.log('DH2.mounted!')

    this.register()

    this.index()
  }
}
</script>

<style lang="sass">

</style>
