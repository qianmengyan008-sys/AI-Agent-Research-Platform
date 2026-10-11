import { writeFile } from 'node:fs/promises';
import { cognitiveV1, emotionV1 } from '@research/experiment-core';
import { demoPolicy } from '@research/ai-orchestrator';
import { createConfiguredGenerator } from '../src/index.js';
import { runExperiment, stateAt, confirmedBelief } from './experiment-run.js';
import { experimentCases } from './experiment-cases.js';
import {
  diagnosticCall,
  generationDiagnostics,
  boundaryFaultDiagnostics,
} from './generation-diagnostics.js';

const output = process.argv[2];
const env: Record<string, string | undefined> = {
  ...process.env,
  MODEL_PROVIDER:
    process.env.MODEL_PROVIDER === 'mock' || !process.env.MODEL_PROVIDER
      ? 'openai-compatible'
      : process.env.MODEL_PROVIDER,
};
const missing = ['MODEL_API_KEY', 'MODEL_NAME'].filter((name) => !env[name]?.trim());
let report: Record<string, unknown>;
if (missing.length > 0) {
  report = {
    mode: 'real-provider',
    status: 'not_run',
    reason: 'missing_configuration',
    missing_variables: missing,
    realProviderCalls: 0,
    synthetic: true,
  };
  process.exitCode = 2;
} else {
  try {
    const { generator, settings } = createConfiguredGenerator(env);
    let calls = 0;
    const counted = {
      generate: async (...args: Parameters<typeof generator.generate>) => {
        calls += 1;
        return generator.generate(...args);
      },
    };
    const cognitive = await runExperiment(cognitiveV1, counted, settings);
    const emotional =
      cognitive.status === 'completed' ? await runExperiment(emotionV1, counted, settings) : null;
    const cases = [];
    if (cognitive.status === 'completed' && emotional?.status === 'completed') {
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
        cases.push(await diagnosticCall(request, counted, settings, scenario.id));
      }
    }
    const pathsCompleted = cognitive.status === 'completed' && emotional?.status === 'completed';
    const diagnostics = pathsCompleted ? await generationDiagnostics(counted, settings) : null;
    const faults = await boundaryFaultDiagnostics(settings);
    const diagnosticResults = diagnostics
      ? [diagnostics.single, ...diagnostics.multi, diagnostics.long]
      : [];
    const results = [
      ...cognitive.calls,
      ...(emotional?.calls ?? []),
      ...cases,
      ...diagnosticResults,
    ];
    const completed =
      pathsCompleted &&
      cases.length === experimentCases.length &&
      diagnostics?.multi.length === 3 &&
      results.every(
        (call) =>
          call.stateUnchanged &&
          call.result.status !== 'blocked' &&
          !call.result.violations.some((v) =>
            ['GENERATOR_FAILURE', 'GENERATOR_TIMEOUT', 'GENERATOR_ABORTED'].includes(v),
          ),
      );
    const cleanOutputs =
      completed &&
      results.every(
        (call) => call.result.status === 'generated' && call.result.violations.length === 0,
      );
    report = {
      mode: 'real-provider',
      status: !completed
        ? 'provider_or_flow_failed'
        : cleanOutputs
          ? 'completed'
          : 'completed_with_guard_interventions',
      synthetic: true,
      inputData: 'synthetic; provider calls are real',
      settings,
      realProviderCalls: calls,
      cognitive,
      emotional,
      cases,
      diagnostics,
      localFaultInjection: faults,
      controlInvariantsPassed: completed && results.every((call) => call.stateUnchanged),
      allOutputsPassedTextGuardsWithoutRecovery: cleanOutputs,
      semanticReview: 'pending_researcher_review',
    };
    if (!completed) process.exitCode = 1;
  } catch {
    // Configuration and unexpected error details must not dump keys or provider payloads.
    report = {
      mode: 'real-provider',
      status: 'failed',
      reason: 'configuration_or_runtime_error',
      synthetic: true,
    };
    process.exitCode = 1;
  }
}
const text = JSON.stringify(report, null, 2) + '\n';
if (output) await writeFile(output, text, 'utf8');
console.info(text);
