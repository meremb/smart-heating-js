import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages project site: https://meremb.github.io/smart-heating-js/
export default defineConfig({
  base: '/smart-heating-js/',
  plugins: [react()],
  server: { port: 5173 }
})
