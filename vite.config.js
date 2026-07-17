import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [tailwindcss()],
  clearScreen: false,
  server: {
    strictPort: true,
    port: 5173,
    host: '127.0.0.1',   // bind to loopback explicitly for Spotify's 127.0.0.1 redirect URI
    open: false,         // let `dev:local` script handle --open; Tauri manages its own webview
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: ['es2021', 'chrome100', 'safari15'],
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
    // Three.js is large by nature; split vendor chunks and raise the advisory limit slightly
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'three',
              test: /node_modules[\\/]three/,
              priority: 20,
            },
            {
              name: 'alpine',
              test: /node_modules[\\/]alpinejs/,
              priority: 15,
            },
            {
              name: 'tauri',
              test: /node_modules[\\/]@tauri-apps/,
              priority: 15,
            },
          ],
        },
      },
    },
    // Fallback for classic Rollup-based Vite builds
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three'
          if (id.includes('node_modules/alpinejs')) return 'alpine'
          if (id.includes('node_modules/@tauri-apps')) return 'tauri'
        },
      },
    },
  },
})
