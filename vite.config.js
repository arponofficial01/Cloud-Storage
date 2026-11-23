import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/tg-file': {
        target: 'https://api.telegram.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/tg-file/, '/file')
      }
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/@supabase/')) {
            return 'vendor-supabase';
          }
          if (id.includes('node_modules/lucide-react/')) {
            return 'vendor-icons';
          }
        }
      }
    }
  }
})
