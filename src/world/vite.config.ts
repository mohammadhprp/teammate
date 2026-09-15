import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  server: { port: 5273, open: false },
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 2000,
  },
})
