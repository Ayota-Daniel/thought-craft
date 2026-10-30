import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
export default defineConfig({
  resolve: {
    alias: {
      obsidian: fileURLToPath(new URL('./tests/obsidian-adapter-stub.ts', import.meta.url)),
    },
  },
  test: { include: ['tests/**/*.test.ts', 'tests/**/*.test.mjs'], environment: 'node' },
});
