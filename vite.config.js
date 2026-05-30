import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: './',                        // relative paths for Electron file:// loading
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    modulePreload: { polyfill: false },   // avoids crossorigin attr issues with file://
    rollupOptions: {
      output: {
        // Single chunk — simpler for Electron file:// loading
        manualChunks: undefined,
      },
    },
  },
});
