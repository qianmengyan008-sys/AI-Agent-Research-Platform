import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadMigrations, migrate } from './migrations.js';
const direction = process.argv[2] ?? 'up';
if (!['up', 'down'].includes(direction) || !process.env.DATABASE_URL) {
  console.error('DATABASE_URL and direction up/down are required. Down deletes research data.');
  process.exitCode = 2;
} else {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 10000,
  });
  try {
    await client.connect();
    const files = await loadMigrations(
      fileURLToPath(new URL('../../../database/migrations/', import.meta.url)),
    );
    console.info(JSON.stringify(await migrate(client, files, direction as 'up' | 'down')));
  } catch {
    // Never dump connection strings, credentials, SQL payloads or provider errors.
    console.error('Database migration failed. Inspect the target and migration history securely.');
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}
