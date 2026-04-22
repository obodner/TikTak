import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api/analyzeImage': { 
        target: 'https://analyzeimage-xzfu3ennuq-uc.a.run.app', 
        changeOrigin: true, 
        rewrite: (path) => path.replace(/^\/api\/analyzeImage/, '') 
      },
      '/api/createTicket': { 
        target: 'https://us-central1-tiktak2026.cloudfunctions.net', 
        changeOrigin: true, 
        rewrite: (path) => path.replace(/^\/api\/createTicket/, '/createTicket') 
      },
      '/api/buildingInfo': { 
        target: 'https://us-central1-tiktak2026.cloudfunctions.net', 
        changeOrigin: true, 
        rewrite: (path) => path.replace(/^\/api\/buildingInfo/, '/getTenantInfo') 
      },
      '/api/manageTenantUser': {
        target: 'https://us-central1-tiktak2026.cloudfunctions.net',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/manageTenantUser/, '/manageTenantUser')
      },
      '/img': {
        target: 'https://tiktak2026.web.app',
        changeOrigin: true
      }
    }
  }
});
