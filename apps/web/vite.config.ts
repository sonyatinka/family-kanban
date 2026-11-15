import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Use the TypeScript source of shared, not its CommonJS build in dist/. The API needs
      // CommonJS, but Rollup can't see named exports (loginSchema…) of a linked CommonJS package.
      // Bonus: edits in packages/shared/src reach the web app without rebuilding shared.
      '@family/shared': fileURLToPath(
        new URL('../../packages/shared/src/index.ts', import.meta.url),
      ),
    },
  },
  server: {
    port: 5173,
    // Requests to /api go to NestJS, so the frontend and the API look like one site
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
