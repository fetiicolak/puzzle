import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' → GitHub Pages'te repo adı ne olursa olsun çalışır (hash routing kullanıyoruz)
export default defineConfig({
  base: './',
  plugins: [react()],
})
