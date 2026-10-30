import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss()],
  test: {
    globals: true,
    environment: 'jsdom',
    pool: 'forks'
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'https://mytiktak.com',
        changeOrigin: true
      },
      '/img': {
        target: 'https://mytiktak.com',
        changeOrigin: true
      },
      '/aud': {
        target: 'https://mytiktak.com',
        changeOrigin: true
      },
      '/audio': {
        target: 'https://mytiktak.com',
        changeOrigin: true
      }
    }
  }
});
