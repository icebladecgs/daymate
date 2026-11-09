import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, '/');

          if (
            normalizedId.includes('node_modules/react') ||
            normalizedId.includes('node_modules/react-dom') ||
            normalizedId.includes('node_modules/@dnd-kit/')
          ) {
            return 'react-vendor';
          }

          if (normalizedId.includes('node_modules/firebase') || normalizedId.includes('node_modules/@firebase/')) {
            return 'firebase-vendor';
          }

          if (normalizedId.includes('/src/firebase.js') || normalizedId.includes('/src/api/gcal.js') || normalizedId.includes('/src/api/drive.js')) {
            return 'integrations';
          }

          if (normalizedId.includes('/src/api/telegram.js') || normalizedId.includes('/src/api/scheduler.js')) {
            return 'messaging';
          }

          if (normalizedId.includes('/src/data/')) {
            return 'daymate-data';
          }

          // 지도 도구는 전국 지도를 열 때만 받는다 (2026-11-09 — vendor에 넣으면 앱을 켤 때마다 150KB 더 받음)
          if (normalizedId.includes('node_modules/leaflet')) {
            return 'leaflet';
          }

          if (normalizedId.includes('node_modules')) {
            return 'vendor';
          }
        },
      },
    },
  },
})
