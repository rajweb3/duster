import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts', 'tests/**/*.test.ts', 'scripts/**/*.test.ts', 'infra/**/*.test.ts', '.github/**/*.test.ts'],
    testTimeout: 30000,
  },
});
