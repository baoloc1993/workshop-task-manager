import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`.
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    // Chưa có unit test thuần (không đuổi theo coverage); smoke test
    // thật nằm ở test:e2e (vitest.config.e2e.ts). `make test` chạy cả hai lệnh.
    passWithNoTests: true,
  },
});
