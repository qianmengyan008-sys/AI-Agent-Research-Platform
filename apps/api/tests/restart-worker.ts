// Isolated process-crash acceptance helper; only synthetic credentials are supplied by tests.
import pg from 'pg';
import { MockAdapter } from '@research/model-adapter';
import { createApp } from '../src/app.js';
import { createServices } from '../src/services/index.js';
import type { ModelSettings } from '@research/model-adapter';
const pool = new pg.Pool(JSON.parse(process.env.RESTART_TEST_DATABASE!));
const settings: ModelSettings = JSON.parse(process.env.RESTART_TEST_SETTINGS!);
const generator = new MockAdapter(
  process.env.RESTART_TEST_MODE === 'hang'
    ? async () => new Promise<string>(() => {})
    : '重启后的安全回复。',
);
const server = createApp(createServices(pool, generator, settings)).listen(0, '127.0.0.1', () => {
  const address = server.address();
  if (address && typeof address !== 'string') console.log(JSON.stringify({ port: address.port }));
});
process.on('SIGTERM', () => server.close(() => void pool.end()));
