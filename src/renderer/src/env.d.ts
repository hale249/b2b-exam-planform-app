/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}

interface Window {
  api: {
    onBlockedProcesses: (callback: (processes: string[]) => void) => void
  }
}
