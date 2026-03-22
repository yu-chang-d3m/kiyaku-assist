import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // eval テストはデフォルトでは除外（pnpm test:eval で実行）
    exclude: ['**/node_modules/**', '**/*.eval.test.ts'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      include: ['src/domains/**', 'src/shared/**'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});

/**
 * eval テストの実行方法:
 *
 *   EVALS=1 vitest run --include '**\/*.eval.test.ts'
 *
 * または:
 *
 *   pnpm test:eval
 */
