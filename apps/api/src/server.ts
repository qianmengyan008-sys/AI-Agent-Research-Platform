import pg from 'pg';
import { createConfiguredGenerator } from '@research/model-adapter';
import { createServices } from './services/index.js';
import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}
const pool = process.env.DATABASE_URL
  ? new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 10000,
      max: 10,
    })
  : undefined;
pool?.on('error', () => console.error('Research database connection interrupted'));
const model = pool ? createConfiguredGenerator(process.env) : undefined;
const services = pool && model ? createServices(pool, model.generator, model.settings) : undefined;
const server = createApp(services, process.env.ADMIN_ACCESS_TOKEN_HASH).listen(
  port,
  '127.0.0.1',
  () => {
    console.info(`Research API listening on port ${port}`);
  },
);
server.on('error', (error) => {
  console.error('Research API startup failed:', error.message);
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    server.close(async (error) => {
      await pool?.end();
      process.exitCode = error ? 1 : 0;
    });
  });
}
