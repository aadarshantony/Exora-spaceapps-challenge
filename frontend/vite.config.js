import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    include: ['react-leaflet', 'leaflet'], // ensures Leaflet is properly pre-bundled
  },
  server: {
    proxy: {
      // Proxy NASA API calls to avoid CORS issues
      '/nasa': {
        target: 'https://power.larc.nasa.gov',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/nasa/, ''),
      },
    },
  },
});
