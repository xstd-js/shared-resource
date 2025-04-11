import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    dir: 'src',
    coverage: {
      provider: 'istanbul',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.{test,bench,protected,private}.ts',
        'src/**/*.{protected,private}/**/*.ts',
      ],
      thresholds: {
        100: true,
      },
    },
  },
});
