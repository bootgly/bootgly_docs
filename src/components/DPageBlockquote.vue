<script setup>
import { defineProps } from 'vue'

const props = defineProps({
  message: {
    type: String,
    default: ''
  }
})
</script>

<template lang="pug">
blockquote
  strong(v-if="message === 'important'") Important
  strong(v-else-if="message === 'warning'") Warning
  strong(v-else-if="message === 'note'") Note
  slot
</template>
