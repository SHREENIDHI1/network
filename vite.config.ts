/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative asset paths: the build works from any sub-folder (GitHub Pages, Netlify, file share).
  base: './',
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Keep large third-party libraries in their own cacheable chunks.
        manualChunks: {
          react: ['react', 'react-dom'],
          flow: ['@xyflow/react'],
          xterm: ['@xterm/xterm', '@xterm/addon-fit'],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
