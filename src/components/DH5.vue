<template lang="pug">
h5(:id="id" @click="navigate(id)" v-html="value")
</template>

<script>
import Navigator from 'pages/bootables/navigator'

export default {
  name: 'DH5',

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
    // console.log('DH5 - created!')
  },

  mounted () {
    // console.log('DH5.mounted!')

    this.register()

    this.index()
  },

  beforeUpdate () {
    // console.log('DH5 - beforeUpdate!')
  },
  updated () {
    // console.log('DH5.mounted!')

    this.register()

    this.index()
  }
}
</script>

<style lang="sass">

</style>
