import express from 'express';
import type { HealthResponse } from '@research/contracts';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.get('/api/health', (_req, res) => {
    const response: HealthResponse = {
      status: 'ok',
      service: 'research-api',
      mode: 'scaffold',
    };
    res.json(response);
  });
  app.use((_req, res) => {
    res.status(404).json({ error: 'NOT_FOUND' });
  });
  return app;
}
