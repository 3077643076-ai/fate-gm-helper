<script setup>
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

onMounted(() => {
  router.replace('/battle-control')
})
</script>

<template>
  <section class="page-card">
    <p style="text-align: center; color: #888; padding: 2rem 0;">正在跳转到战斗控制页...</p>
  </section>
</template>
