import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}
const server = createApp().listen(port, '127.0.0.1', () => {
  console.info(`Research API scaffold listening on port ${port}`);
});
server.on('error', (error) => {
  console.error('Research API startup failed:', error.message);
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    server.close((error) => {
      process.exitCode = error ? 1 : 0;
    });
  });
}
