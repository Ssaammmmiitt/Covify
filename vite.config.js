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
  },
})
