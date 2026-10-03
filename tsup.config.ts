import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  splitting: false,
  external: ['ai', '@ai-sdk/react', '@ag-ui/client', '@ag-ui/core'],
});
