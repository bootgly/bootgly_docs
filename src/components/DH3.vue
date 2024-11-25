<script setup>
import { defineProps, onMounted, onUpdated } from 'vue'

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

const { register, index, navigate, selected } = useNavigator()

selected.value = props.value

onMounted(() => {
  register(props.id)
  index(props.id, true)
})

onUpdated(() => {
  register(props.id)
  index(props.id, true)
})
</script>

<template lang="pug">
h3(:id="id" @click="navigate(id)" v-html="value")
</template>
