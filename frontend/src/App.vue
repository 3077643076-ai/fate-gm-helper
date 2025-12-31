<script setup>
import NavBar from './components/NavBar.vue'
</script>

<template>
  <div class="app">
    <NavBar />
    <main class="app-main">
      <RouterView />
    </main>
    <footer class="footer">
      <p class="footer-text">© 2023 Fate GM助手 - 为您的游戏体验保驾护航</p>
    </footer>
  </div>
</template>
