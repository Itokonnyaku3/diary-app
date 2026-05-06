import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages にデプロイする場合は base をリポジトリ名に変更してください
// 例: リポジトリ名が "diary-app" なら base: '/diary-app/'
export default defineConfig({
  plugins: [react()],
  base: './',
})
