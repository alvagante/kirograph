import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/fixtures/**', 'node_modules/**'],
    testTimeout: 30000,
    hookTimeout: 30000,
    reporters: ['verbose'],
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reportsDirectory: 'tests/coverage',
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'node_modules/**',
        'tests/**',
      ],
      all: true,
    },
  },
});
