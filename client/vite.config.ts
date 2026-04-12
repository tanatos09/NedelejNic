import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    __DEV__: JSON.stringify(true),
  },
  server: {
    port: 5173,
    proxy: {
      '/auth': 'http://localhost:3001',
      '/level': 'http://localhost:3001',
      '/result': 'http://localhost:3001',
      '/admin': 'http://localhost:3001',
    },
  },
});
