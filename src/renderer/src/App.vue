<script setup lang="ts">
import { onMounted } from 'vue'

onMounted(() => {
  // Disable right-click context menu
  document.addEventListener('contextmenu', (e) => e.preventDefault())

  // Block print/save shortcuts
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 's')) {
      e.preventDefault()
    }
  })
})
</script>

<template>
  <div id="exam-app" class="w-full h-full flex items-center justify-center">
    <!-- Loading state (shown briefly before webview loads) -->
    <div class="text-center">
      <div class="w-10 h-10 border-4 border-white/10 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
      <h1 class="text-2xl mb-4 text-slate-200">PrepEdu Exam Platform</h1>
      <p class="text-slate-400 text-sm">Đang tải hệ thống thi...</p>
    </div>
  </div>
</template>

<style>
html,
body {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #1a1a2e;
  color: #fff;
  user-select: none;
  -webkit-user-select: none;
}

#app {
  width: 100%;
  height: 100%;
}
</style>
