/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2022',
    sourcemap: true,
    // parity with tools/build.js: single bundle, no code-split for prod PWA
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
  server: {
    port: 5173,
    open: false,
  },
  test: {
    environment: 'happy-dom',
    setupFiles: ['tests/setup.ts'],
  },
});
