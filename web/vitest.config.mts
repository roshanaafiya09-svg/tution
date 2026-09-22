import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * Unit/component tests — run against a mocked `fetch`, in jsdom.
 * The real-HTTP suite (a live backend) has its own config:
 * vitest.integration.config.mts.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // Sentry's Next.js build pulls in server-only modules; the client only
      // needs breadcrumbs/scopes, which the stub records.
      '@sentry/nextjs': path.resolve(__dirname, 'src/test/sentry-stub.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['src/**/*.integration.test.{ts,tsx}', 'node_modules/**'],
    env: { NEXT_PUBLIC_API_URL: 'http://api.test' },
  },
});
