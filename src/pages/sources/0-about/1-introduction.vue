<template lang="pug">
d-page(:headers="headers")
  d-h1(id="0")

  d-p(id="0")
</template>

<script>
import Overview from 'src/pages/resources/sections/overview'

export default {
  mixins: [Overview],

  data () {
    return {
      headers: [
        {
          id: 0
          /*
          children: [
            {
              id: 1
            },
            {
              id: 2
            }
          ]
          */
        }
      ]
    }
  }
}
</script>

<style scoped></style>
