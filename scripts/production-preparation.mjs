/** Infrastructure-only production preparation. No experiment bootstrap or model calls. */
import express from 'express';
import pg from 'pg';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
export function createProductionPreparation(env, pool) {
  if (
    env.RESEARCH_DATABASE_SCOPE !== 'isolated-production' ||
    env.RESEARCH_RECRUITMENT_ENABLED !== 'false' ||
    env.PRODUCTION_DATABASE_NAME !== 'ai_agent_research_production'
  )
    throw Error('PRODUCTION_PREPARATION_GATE_REJECTED');
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.get('/api/ready', async (_req, res) => {
    try {
      const db = await pool.query('SELECT current_database() AS name');
      if (db.rows[0]?.name !== env.PRODUCTION_DATABASE_NAME)
        throw Error('PRODUCTION_DATABASE_IDENTITY_MISMATCH');
      // A preparation database must be empty. Never attach internal-test data or mutate it.
      const tables = await pool.query(
        "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema IN ('public','research') AND table_type='BASE TABLE'",
      );
      if (tables.rows[0]?.n !== 0) throw Error('PRODUCTION_DATABASE_NOT_EMPTY');
      res.json({
        status: 'infrastructure_ready',
        database: 'ok',
        mode: 'production-preparation-only',
        research_ready: false,
        formal_ready: false,
        recruitment_enabled: false,
      });
    } catch {
      res.status(503).json({ error: 'PRODUCTION_DATABASE_CHECK_FAILED', formal_ready: false });
    }
  });
  app.use((_req, res) =>
    res.status(503).json({ error: 'RESEARCH_APPROVAL_AND_RUNTIME_PENDING', formal_ready: false }),
  );
  return app;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let pool;
  try {
    if (!process.env.DATABASE_URL) throw Error('DATABASE_MISSING');
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 2,
      connectionTimeoutMillis: 5000,
      statement_timeout: 5000,
      query_timeout: 6000,
    });
    pool.on('error', () => console.error('PRODUCTION_DATABASE_UNAVAILABLE'));
    const app = createProductionPreparation(process.env, pool);
    const server = app.listen(Number(process.env.PORT ?? 10000), '0.0.0.0');
    const stop = () => server.close(() => void pool.end());
    process.once('SIGTERM', stop);
    process.once('SIGINT', stop);
  } catch {
    await pool?.end();
    console.error('PRODUCTION_PREPARATION_START_FAILED');
    process.exitCode = 1;
  }
}
