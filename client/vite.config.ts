import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative asset URLs: one build works under any path prefix the reverse proxy chooses
  base: './',
  server: {
    port: 3010,
    proxy: {
      '/verify': 'http://localhost:3011',
      '/rooms': 'http://localhost:3011',
      '/auth': 'http://localhost:3011',
      '/socket.io': {
        target: 'http://localhost:3011',
        ws: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/__tests__/setup.ts',
  },
});
