import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
export async function localModel(
  handler: (
    request: IncomingMessage,
    response: ServerResponse,
    body: Record<string, unknown>,
  ) => void,
) {
  const requests: Record<string, unknown>[] = [];
  const server = createServer(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk.toString();
    const body = JSON.parse(raw) as Record<string, unknown>;
    requests.push(body);
    handler(request, response, body);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing server address');
  return {
    baseURL: `http://127.0.0.1:${address.port}/v1`,
    requests,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
export function completion(content: string) {
  return { choices: [{ message: { role: 'assistant', content } }] };
}
