import { test, expect } from 'vitest';
import { createConfiguredGenerator } from '@research/model-adapter';
import { cognitiveV1 } from '@research/experiment-core';
import { demoPolicy } from '@research/ai-orchestrator';
import { stateAt } from '../../../packages/model-adapter/examples/experiment-run.js';
import { auditedModelTransport } from '../src/services/model-transport-audit.js';
import { ModelRunService } from '../src/services/model-run-service.js';
test('transport observation preserves provider retry and stores missing actual identity as null without error payloads', async () => {
  let calls = 0;
  const secret = 'SYNTHETIC_PROVIDER_PAYLOAD_MUST_NOT_APPEAR';
  const transport: typeof fetch = async () => {
    calls++;
    return calls === 1
      ? new Response(JSON.stringify({ error: { message: secret } }), { status: 502 })
      : new Response(
          JSON.stringify({
            choices: [{ message: { content: '你愿意补充这个印象的具体来源吗？' } }],
          }),
        );
  };
  const configured = createConfiguredGenerator(
    {
      MODEL_PROVIDER: 'gpt',
      GPT_MODEL_NAME: 'gpt-4',
      GPT_API_KEY: 'OFFLINE_KEY',
      GPT_API_BASE_URL: 'https://gpt.fixture/v1',
    },
    auditedModelTransport(transport),
  );
  const service = new ModelRunService(configured.generator, configured.settings);
  const state = stateAt(cognitiveV1, 'STEREOTYPE_CAPTURE');
  const result = await service.generate(
    {
      state,
      definition: cognitiveV1,
      policy: demoPolicy(cognitiveV1, state.stage),
      userInput: '我想讨论一个从媒体形成的印象。',
    },
    configured.settings,
  );
  expect(calls).toBe(2);
  expect(result.status).toBe('generated');
  expect(result).toMatchObject({
    model_transport_attempts: [
      {
        attempt: 1,
        provider: 'openai-compatible',
        requested_model: 'gpt-4',
        response_model: null,
        http_status: 502,
        network_failed: false,
      },
      {
        attempt: 2,
        provider: 'openai-compatible',
        requested_model: 'gpt-4',
        response_model: null,
        http_status: 200,
        network_failed: false,
      },
    ],
  });
  expect(JSON.stringify(result)).not.toContain(secret);
  expect(JSON.stringify(result)).not.toContain('OFFLINE_KEY');
});
