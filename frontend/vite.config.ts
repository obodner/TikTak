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
      '/api/analyzeImage': { 
        target: 'https://analyzeimage-100013179958.us-central1.run.app', 
        changeOrigin: true, 
        rewrite: (path) => path.replace(/^\/api\/analyzeImage/, '') 
      },
      '/api/createTicket': { 
        target: 'https://createticket-100013179958.us-central1.run.app', 
        changeOrigin: true, 
        rewrite: (path) => path.replace(/^\/api\/createTicket/, '') 
      },
      '/api/buildingInfo': { 
        target: 'https://gettenantinfo-100013179958.us-central1.run.app', 
        changeOrigin: true, 
        rewrite: (path) => path.replace(/^\/api\/buildingInfo/, '') 
      },
      '/api/manageTenantUser': {
        target: 'https://managetenantuser-100013179958.us-central1.run.app',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/manageTenantUser/, '')
      },
      '/api/checkAuth': {
        target: 'https://checkauth-100013179958.us-central1.run.app',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/checkAuth/, '')
      },
      '/api/submitAppFeedback': {
        target: 'https://submitappfeedback-100013179958.us-central1.run.app',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/submitAppFeedback/, '')
      },
      '/api/submitSupportInquiry': {
        target: 'https://submitsupportinquiry-100013179958.us-central1.run.app',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/submitSupportInquiry/, '')
      },
      '/api/landingMetrics': {
        target: 'https://landingmetrics-100013179958.us-central1.run.app',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/landingMetrics/, '')
      },
      '/img': {
        target: 'https://tiktak2026.web.app',
        changeOrigin: true
      }
    }
  }
});
