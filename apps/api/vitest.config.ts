import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    coverage: {
      reporter: ['text', 'lcov'],
    },
  },
  resolve: {
    alias: {
      '@api': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  esbuild: {
    tsconfig: './tsconfig.json',
  },
});
