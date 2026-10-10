import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['apps/api/tests/**/*.test.ts', 'packages/experiment-core/tests/**/*.test.ts'],
  },
});
