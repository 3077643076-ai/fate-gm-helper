<script setup>
// 应用外壳：普通页面带导航栏；引擎控制台（/engine）全屏独立风格，隐藏导航与页脚
import NavBar from './components/NavBar.vue'
import { useRoute } from 'vue-router'
import { computed } from 'vue'

const route = useRoute()
const isEngine = computed(() => route.path.startsWith('/engine'))
</script>

<template>
  <div class="app" :class="{ 'app-engine': isEngine }">
    <NavBar v-if="!isEngine" />
    <main class="app-main">
      <RouterView />
    </main>
    <footer v-if="!isEngine" class="footer">
      <p class="footer-text">© 2023 Fate GM助手 - 为您的游戏体验保驾护航</p>
    </footer>
  </div>
</template>

<style scoped>
/* 引擎控制台全屏：去掉主站的内边距限制 */
.app-engine .app-main {
  padding: 0;
  margin: 0;
  max-width: none;
}
</style>
