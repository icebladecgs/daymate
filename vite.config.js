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

          if (normalizedId.includes('node_modules/react') || normalizedId.includes('node_modules/react-dom')) {
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

          if (normalizedId.includes('node_modules')) {
            return 'vendor';
          }
        },
      },
    },
  },
})
