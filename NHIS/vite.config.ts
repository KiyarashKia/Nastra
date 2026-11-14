import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Library build: one ESM bundle + one stylesheet (dist/nhis.css).
// react, react-dom and react-aria-components stay external so the consuming app owns them.
export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'index.ts'),
      formats: ['es'],
      fileName: () => 'nhis.js',
      cssFileName: 'nhis',
    },
    cssCodeSplit: false,
    sourcemap: true,
    emptyOutDir: true,
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime', 'react-aria-components', /^@react-aria\//, /^@react-stately\//],
    },
  },
});
