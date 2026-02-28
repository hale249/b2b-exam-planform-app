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
      <div class="w-12 h-12 border-4 border-gray-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
      <h1 class="text-2xl mb-3 font-semibold text-gray-800">PrepEdu Exam Platform</h1>
      <p class="text-gray-500 text-sm">Đang tải hệ thống thi...</p>
    </div>
  </div>
</template>

<style>
html,
body {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #ffffff;
  color: #1f2937;
  user-select: none;
  -webkit-user-select: none;
}

#app {
  width: 100%;
  height: 100%;
}
</style>
