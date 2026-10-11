import express from 'express';
import type { ErrorRequestHandler } from 'express';
import type { Services } from './services/index.js';
import { ServiceError } from './services/common.js';
import { businessRoutes } from './controllers/routes.js';
import type { HealthResponse } from '@research/contracts';

export function createApp(services?: Services, adminTokenHash?: string) {
  if (adminTokenHash !== undefined && !/^[a-f0-9]{64}$/.test(adminTokenHash))
    throw new Error('ADMIN_ACCESS_TOKEN_HASH must be a SHA-256 digest');
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
  if (services) {
    app.use(express.json({ limit: '64kb' }));
    app.use('/api', businessRoutes(services, adminTokenHash));
  }
  const errors: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    void _next;
    if (error instanceof ServiceError) {
      res.status(error.status).json({ error: error.code });
      return;
    }
    const code = (error as { code?: string })?.code;
    const status = (error as { status?: number })?.status;
    if (code === '23505') {
      res.status(409).json({ error: 'CONFLICT' });
      return;
    }
    if (['23503', '23514', '22P02'].includes(code ?? '') || status === 400) {
      res.status(400).json({ error: 'INVALID_INPUT' });
      return;
    }
    res
      .status(status === 413 ? 413 : 500)
      .json({ error: status === 413 ? 'INPUT_TOO_LARGE' : 'INTERNAL_ERROR' });
  };
  app.use(errors);
  app.use((_req, res) => {
    res.status(404).json({ error: 'NOT_FOUND' });
  });
  return app;
}
