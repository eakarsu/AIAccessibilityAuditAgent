import { defineConfig, transformWithOxc } from 'vite';
import react from '@vitejs/plugin-react';

const backendPort = Number(process.env.BACKEND_PORT || 30012);
const frontendPort = Number(process.env.PORT || process.env.FRONTEND_PORT || 30013);
const jsxInJs = {
  name: 'jsx-in-js',
  enforce: 'pre',
  async transform(code, id) {
    if (!id.includes('/src/') || !id.endsWith('.js')) return null;
    return transformWithOxc(code, id, {
      lang: 'jsx',
      jsx: { runtime: 'automatic' },
    });
  },
};

export default defineConfig({
  plugins: [jsxInJs, react()],
  oxc: {
    include: /src\/.*\.js$/,
    exclude: [],
  },
  optimizeDeps: {
    rolldownOptions: {
      moduleTypes: { '.js': 'jsx' },
    },
  },
  server: {
    host: process.env.HOST || '127.0.0.1',
    port: frontendPort,
    strictPort: true,
    proxy: {
      '/api': `http://127.0.0.1:${backendPort}`,
    },
  },
  build: {
    outDir: 'build',
    chunkSizeWarningLimit: 1000,
    rolldownOptions: {
      moduleTypes: { '.js': 'jsx' },
    },
  },
});
