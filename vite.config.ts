import { defineConfig } from 'vite'

export default defineConfig({
  base: process.env.GITHUB_PAGES_BASE ?? './',
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ['phaser'],
        },
      },
    },
  },
  server: {
    host: true,
    port: 3000,
    open: true,
  },
  preview: {
    port: 4173,
    host: true,
  },
})
