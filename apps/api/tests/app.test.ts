import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('API scaffold', () => {
  it('serves the process-health contract without claiming experiment readiness', async () => {
    const response = await request(createApp()).get('/api/health').expect(200);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.body).toEqual({
      status: 'ok',
      service: 'research-api',
      mode: 'scaffold',
    });
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('does not expose an experiment mutation endpoint in Step 1', async () => {
    const response = await request(createApp())
      .post('/api/participant/session/events')
      .send({ stage: 'completed' })
      .expect(404);
    expect(response.body).toEqual({ error: 'NOT_FOUND' });
  });
});
