import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5175,
    proxy: {
      '/api': 'http://127.0.0.1:8787',
      '/apps/requirement-editor': 'http://127.0.0.1:8787',
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'console-assets',
  },
})
