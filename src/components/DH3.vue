<template lang="pug">
h3(:id="id" @click="navigate(id)" v-html="value")
</template>

<script>
import Navigator from 'pages/bootables/navigator'

export default {
  name: 'DH3',

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
    // console.log('DH3 - created!')
  },

  mounted () {
    // console.log('DH3.mounted!')

    this.register()

    this.index(true)
  },

  beforeUpdate () {
    // console.log('DH3 - beforeUpdate!')
  },
  updated () {
    // console.log('DH3.mounted!')

    this.register()

    this.index(true)
  }
}
</script>

<style lang="sass">

</style>
