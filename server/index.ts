import { existsSync, mkdirSync } from 'node:fs';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createApp } from './app';
import { connectEmbedded, connectPostgres, migrate } from './db';

try {
  process.loadEnvFile('.env');
} catch {
  // No .env file: fall back to the embedded database.
}

const url = process.env.DATABASE_URL;
let db;
if (url) {
  db = await connectPostgres(url);
  console.log('Database: Postgres from DATABASE_URL');
} else {
  const dataDir = process.env.DATA_DIR ?? '.data';
  mkdirSync(dataDir, { recursive: true });
  db = await connectEmbedded(`${dataDir}/pglite`);
  console.log('Database: embedded Postgres in .data/pglite (set DATABASE_URL to use Neon)');
}
await migrate(db);

if (process.env.NODE_ENV === 'production' && !process.env.ADMIN_PASSWORD) {
  console.warn('WARNING: ADMIN_PASSWORD is not set. The default admin password is public in the repository.');
}

const app = createApp(db);

// After `npm run build`, one server can run the whole app.
if (existsSync('dist')) {
  app.use('/*', serveStatic({ root: './dist' }));
}

// In development the Vite proxy expects 8787, whatever PORT the shell happens to set.
const port = process.env.NODE_ENV === 'production' ? Number(process.env.PORT ?? 8787) : 8787;
serve({ fetch: app.fetch, port }, () => console.log(`API listening on http://localhost:${port}`));
