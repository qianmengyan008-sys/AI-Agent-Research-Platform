import { readFile } from 'node:fs/promises';
import { createHostedDeployment } from './hosted-platform.mjs';
let runtime, server;
try {
  const meta = JSON.parse(
    await readFile(new URL('../deploy/researcher-preview-build.json', import.meta.url), 'utf8'),
  );
  process.env.RESEARCH_CODE_COMMIT = process.env.RENDER_GIT_COMMIT ?? meta.code_commit;
  if (!/^[a-f0-9]{40}$/.test(process.env.RESEARCH_CODE_COMMIT))
    throw new Error('INVALID_CODE_COMMIT');
  runtime = await createHostedDeployment();
  const port = Number(process.env.PORT ?? 10000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('INVALID_HOSTED_PORT');
  server = runtime.app.listen(port, '0.0.0.0');
  await new Promise((ok, fail) => {
    server.once('listening', ok);
    server.once('error', fail);
  });
  console.info(`HOSTED_RESEARCH_LISTENING_PORT=${port}`);
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, () =>
      server.close(async () => {
        await runtime.pool.end();
        process.exit(0);
      }),
    );
} catch (error) {
  server?.close();
  await runtime?.pool.end();
  console.error(
    error instanceof Error && /^[A-Z_]+$/.test(error.message)
      ? error.message
      : 'HOSTED_START_FAILED',
  );
  process.exitCode = 1;
}
