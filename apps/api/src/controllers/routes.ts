import { Router } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import type { Services } from '../services/index.js';
import { fail } from '../services/common.js';
import type { ParticipantIdentity } from '../services/common.js';
export function businessRoutes(services: Services, adminTokenHash?: string) {
  const router = Router();
  const bearer = (req: Request) => {
    const h = req.headers.authorization;
    if (!h || !/^Bearer [^ ]+$/.test(h)) fail(401, 'UNAUTHORIZED');
    return h!.slice(7);
  };
  const participant = (req: Request): ParticipantIdentity =>
    req.res!.locals.participant as ParticipantIdentity;
  const actor = { role: 'admin' as const, id: 'bootstrap-admin' };
  router.post('/auth/login', async (req, res) => {
    res.json(await services.participants.login(req.body));
  });
  router.use('/admin', (req, _res, next) => {
    if (!adminTokenHash) fail(503, 'ADMIN_DISABLED');
    const supplied = createHash('sha256').update(bearer(req)).digest();
    const expected = Buffer.from(adminTokenHash!, 'hex');
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
      fail(401, 'UNAUTHORIZED');
    next();
  });
  router.get('/admin/experiments', async (_req, res) => {
    res.json(await services.admin.experiments(actor));
  });
  router.post('/admin/experiments', async (req, res) => {
    res.status(201).json(await services.experiments.create(actor, req.body));
  });
  router.post('/admin/experiments/:id/conditions', async (req, res) => {
    res
      .status(201)
      .json(await services.experiments.condition(actor, String(req.params.id), req.body));
  });
  router.post('/admin/experiments/:id/publish', async (req, res) => {
    res.json(await services.experiments.publish(actor, String(req.params.id)));
  });
  router.post('/admin/participants', async (req, res) => {
    res.status(201).json(await services.participants.create(actor, req.body));
  });
  router.post('/admin/assignments', async (req, res) => {
    res.status(201).json(await services.experiments.assign(actor, req.body));
  });
  router.get('/admin/participants', async (req, res) => {
    res.json(await services.admin.participants(actor, String(req.query.experiment_id ?? '')));
  });
  router.get('/admin/conversations', async (req, res) => {
    res.json(await services.admin.conversations(actor, String(req.query.experiment_id ?? '')));
  });
  router.get('/admin/export', async (req, res) => {
    res.json(await services.admin.export(actor, String(req.query.experiment_id ?? '')));
  });
  router.use(async (req, res, next) => {
    if (
      ![
        '/auth/logout',
        '/experiment/current',
        '/experiment/state',
        '/experiment/submissions',
        '/conversation/message',
        '/conversation/messages',
      ].includes(req.path) &&
      !req.path.startsWith('/conversation/turns/')
    )
      return next();
    res.locals.participant = await services.participants.authenticate(bearer(req));
    next();
  });
  router.post('/auth/logout', async (req, res) => {
    res.json(await services.participants.logout(bearer(req)));
  });
  router.get('/experiment/current', async (req, res) => {
    res.json(await services.participants.current(participant(req)));
  });
  router.get('/experiment/state', async (req, res) => {
    const current = await services.participants.current(participant(req));
    res.json({
      state_token: current.state_token,
      status: current.status,
      form: current.form,
      ...(current.pending_turn_id ? { pending_turn_id: current.pending_turn_id } : {}),
    });
  });
  router.post('/experiment/submissions', async (req, res) => {
    res.json(await services.participants.submit(participant(req), req.body));
  });
  router.post('/conversation/message', async (req, res) => {
    res.json(await services.conversations.send(participant(req), req.body));
  });
  router.get('/conversation/messages', async (req, res) => {
    res.json(await services.conversations.messages(participant(req)));
  });
  router.get('/conversation/turns/:id', async (req, res) => {
    res.json(await services.conversations.status(participant(req), String(req.params.id)));
  });
  return router;
}
