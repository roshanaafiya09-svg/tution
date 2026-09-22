import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Real-HTTP tests: the production api client talks to a RUNNING backend
 * (default http://127.0.0.1:3001) over a real socket — no fetch mocks.
 * Start the backend first (`npm --prefix ../backend run start:dev`).
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@sentry/nextjs': path.resolve(__dirname, 'src/test/sentry-stub.ts'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.integration.test.{ts,tsx}'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    env: { NEXT_PUBLIC_API_URL: process.env.INTEGRATION_API_URL ?? 'http://127.0.0.1:3001' },
  },
});
