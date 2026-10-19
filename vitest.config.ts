import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Windows process/Worker deadlines must not compete with every test file.
    ...(process.platform === 'win32'
      ? { maxWorkers: 1, testTimeout: 15000, hookTimeout: 15000 }
      : {}),
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
  },
});
