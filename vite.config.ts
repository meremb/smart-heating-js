import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base:'./' makes asset paths relative, which works well on GitHub Pages.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5173 }
})
