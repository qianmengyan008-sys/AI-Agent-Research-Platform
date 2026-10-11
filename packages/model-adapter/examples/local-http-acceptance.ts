import { cognitiveV1, emotionV1 } from '@research/experiment-core';
import { demoPolicy } from '@research/ai-orchestrator';
import { OpenAICompatibleAdapter } from '../src/index.js';
import type { ModelSettings } from '../src/index.js';
import { runExperiment, stateAt, confirmedBelief } from './experiment-run.js';
import { experimentCases } from './experiment-cases.js';
import {
  diagnosticCall,
  generationDiagnostics,
  boundaryFaultDiagnostics,
} from './generation-diagnostics.js';
import { localModel, completion } from '../tests/helpers/http-server.js';

const settings: ModelSettings = {
  provider: 'openai-compatible',
  model_name: 'local-http-fixture',
  base_url: null,
  temperature: 0.2,
  max_tokens: 512,
  timeout_ms: 1000,
  max_attempts: 2,
};
let sequence = 0;
const server = await localModel((_req, res, body) => {
  const messages = body.messages as { content: string }[];
  const belief = messages[1]?.content.match(/唯一确认观点：(.*)/u)?.[1];
  sequence += 1;
  const reply = belief
    ? `你提到“${JSON.parse(belief)}”。哪些经历与你的看法有关？`
    : `在图书馆整理图书的这段经历里，你愿意多聊一点吗？（${sequence}）`;
  res.end(JSON.stringify(completion(reply)));
});
try {
  const generator = new OpenAICompatibleAdapter({
    baseURL: server.baseURL,
    apiKey: 'SYNTHETIC_HTTP_KEY',
    model: settings.model_name,
    temperature: settings.temperature,
    maxTokens: settings.max_tokens,
    timeoutMs: settings.timeout_ms,
    allowLocalHTTP: true,
  });
  const cognitive = await runExperiment(cognitiveV1, generator, settings);
  const emotional = await runExperiment(emotionV1, generator, settings);
  const cases = [];
  for (const scenario of experimentCases) {
    const definition = scenario.path === 'cognitive' ? cognitiveV1 : emotionV1;
    const state = stateAt(
      definition,
      scenario.stage,
      'belief' in scenario ? scenario.belief : confirmedBelief,
    );
    const request = {
      state,
      definition,
      policy: demoPolicy(definition, state.stage),
      userInput: scenario.input,
    };
    cases.push(await diagnosticCall(request, generator, settings, scenario.id));
  }
  const diagnostics = await generationDiagnostics(generator, settings);
  const faults = await boundaryFaultDiagnostics(settings);
  console.info(
    JSON.stringify(
      {
        mode: 'local-http-fixture',
        realProviderCalls: 0,
        synthetic: true,
        cognitive,
        emotional,
        cases,
        diagnostics,
        localFaultInjection: faults,
        httpRequests: server.requests.length,
      },
      null,
      2,
    ),
  );
} finally {
  await server.close();
}
