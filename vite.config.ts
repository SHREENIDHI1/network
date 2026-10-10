/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/** Build stamp shown in the status bar, so you can tell which version is running. */
function gitCommit(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  // Relative asset paths: the build works from any sub-folder (GitHub Pages, Netlify, file share).
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(gitCommit()),
  },
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
    // The grand capstone replays 20+ fault tickets on the 27-router J2 backbone.
    testTimeout: 30000,
  },
});
