<script setup>
import { defineProps } from 'vue'

import useNavigator from 'src/composables/useNavigator'

const props = defineProps({
  id: {
    type: Number,
    required: true
  },
  value: {
    type: String,
    required: true
  }
})

const { navigate, selected } = useNavigator()

selected.value = props.value
</script>

<template lang="pug">
h6(:id="id" @click="navigate(id)" v-html="value")
</template>
