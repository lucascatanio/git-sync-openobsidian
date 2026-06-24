import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Note: strip-module-type is applied as a postbuild npm script (build/strip-module-type.mjs)
// because it must run after viteSingleFile's generateBundle has inlined all assets.
export default defineConfig({
  plugins: [
    preact(),
    viteSingleFile({ useRecommendedBuildConfig: true, removeViteModuleLoader: true }),
  ],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: './panel.html',
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
