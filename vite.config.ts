import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    electron([
      {
        entry: 'src/main/index.ts',
        vite: {
          build: {
            outDir: 'dist-electron/main',
            emptyOutDir: true,
            minify: 'esbuild',
            sourcemap: false,
            rollupOptions: {
              // Load electron-updater from node_modules at runtime instead of
              // bundling it — it has dynamic requires that don't bundle cleanly,
              // and electron-builder ships it in the asar (it's a dependency).
              external: ['electron-updater']
            }
          }
        }
      },
      {
        entry: 'src/preload/index.ts',
        onstart(args) {
          args.reload()
        },
        vite: {
          build: {
            outDir: 'dist-electron/preload',
            emptyOutDir: true,
            minify: 'esbuild',
            sourcemap: false
          }
        }
      }
    ]),
    renderer()
  ]
})
