import { defineConfig } from 'drizzle-kit';

// drizzle-kit does not read .env by itself, so load the root .env with Node
try {
  process.loadEnvFile('../../.env');
} catch {
  // No file: DATABASE_URL is set in the environment (for example, in CI)
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  // Generated SQL migrations. Commit them and never edit them by hand
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL! },
  strict: true,
});
