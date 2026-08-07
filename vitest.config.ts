import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['test/integration/env-setup.ts'],
    testTimeout: 15000,
  },
});
