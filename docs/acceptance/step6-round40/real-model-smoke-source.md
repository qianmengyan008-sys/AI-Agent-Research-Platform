# 真实模型格式小样的执行源码

此为本轮实际运行的独立只读模型测试脚本，不连接研究数据库、不部署Render。2次真实调用已记录在real-model-format-smoke.json。环境变量只在服务器读取，不包含密钥值。源码使用当时工作区的绝对路径；它不是部署启动脚本，也不属于自动化CI步骤。

```typescript
import { writeFile } from 'node:fs/promises';
import { createConfiguredGenerator } from '/workspace/AI-Agent-Research-Platform/packages/model-adapter/dist/index.js';
import {
  dailyV1,
  emotionV1,
} from '/workspace/AI-Agent-Research-Platform/packages/experiment-core/dist/index.js';
import {
  boundedBubbles,
  validGeneratedReply,
} from '/workspace/AI-Agent-Research-Platform/packages/contracts/dist/index.js';
import { demoState } from '/workspace/AI-Agent-Research-Platform/packages/ai-orchestrator/examples/fixtures.ts';
import {
  mentorPolicy,
  mentorConfig,
} from '/workspace/AI-Agent-Research-Platform/apps/api/src/services/research-profile.ts';
import { ModelRunService } from '/workspace/AI-Agent-Research-Platform/apps/api/src/services/model-run-service.ts';
import { auditedModelTransport } from '/workspace/AI-Agent-Research-Platform/apps/api/src/services/model-transport-audit.ts';
const configured = createConfiguredGenerator(
  {
    ...process.env,
    MODEL_PROVIDER: 'deepseek',
    DEEPSEEK_MODEL_NAME: 'deepseek-flash',
    MODEL_TEMPERATURE: '0.2',
    MODEL_MAX_TOKENS: '512',
    MODEL_TIMEOUT_MS: '10000',
    MODEL_MAX_ATTEMPTS: '2',
  },
  auditedModelTransport(),
);
const service = new ModelRunService(configured.generator, configured.settings);
const cases = [];
for (const path of ['daily', 'emotional'] as const) {
  const definition = path === 'daily' ? dailyV1 : emotionV1,
    stage = path === 'daily' ? 'NATURAL_CHAT' : 'PERSONA_SETUP';
  const started = performance.now();
  try {
    const result = await service.generate(
      {
        state: demoState(definition, stage),
        definition,
        policy: mentorPolicy(definition, stage, mentorConfig),
        userInput:
          path === 'daily' ? '今天学习有点忙，想聊聊音乐。' : 'Marcus喜欢音乐，性格有些害羞。',
      },
      configured.settings,
      {},
      true,
      {
        path,
        maxBubbles: 3,
        fixed: false,
        identity: path === 'daily' ? 'Jamal · 美国黑人男性' : '',
      },
    );
    cases.push({
      path,
      status: result.status,
      format_pass: typeof result.text === 'string' && validGeneratedReply(result.text, path),
      text: result.text,
      bubbles: result.text ? boundedBubbles(result.text, path) : null,
      attempts: result.attempts,
      latency_ms: Math.round(performance.now() - started),
      transport: 'model_transport_attempts' in result ? result.model_transport_attempts : [],
      violations: result.violations,
    });
  } catch {
    cases.push({
      path,
      status: 'failed_before_result',
      format_pass: false,
      text: null,
      transport: [],
      latency_ms: Math.round(performance.now() - started),
    });
  }
}
const report = {
  synthetic_inputs: true,
  real_provider: true,
  scope: 'two bounded format smoke cases; not full real-model paths or a Render test',
  settings: configured.settings,
  cases,
};
await writeFile(
  '/workspace/AI-Agent-Research-Platform/docs/acceptance/step6-round40/real-model-format-smoke.json',
  JSON.stringify(report, null, 2) + '\n',
);
process.stdout.write(
  JSON.stringify(
    cases.map(({ path, status, format_pass, latency_ms, transport }) => ({
      path,
      status,
      format_pass,
      latency_ms,
      transport,
    })),
  ) + '\n',
);
```
