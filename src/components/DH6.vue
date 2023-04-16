<template lang="pug">
h6(:id="id" @click="navigate(id)" v-html="value")
</template>

<script>
import Navigator from 'pages/resources/navigator'

export default {
  name: 'DH6',

  mixins: [
    Navigator
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

    window.addEventListener('onLoad', () => {
      this.register()
    })
  },

  mounted () {
    // console.log('DH6.mounted!')

    this.register()

    this.index()
  },

  beforeUpdate () {
    // console.log('DH6 - beforeUpdate!')
  },
  updated () {
    // console.log('DH6.mounted!')

    this.register()

    this.index()
  }
}
</script>

<style lang="sass">

</style>
