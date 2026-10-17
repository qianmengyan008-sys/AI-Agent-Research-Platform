import type { Express } from 'express';
import type { Pool } from 'pg';
import type { LanguageGenerator } from '@research/ai-orchestrator';
import type { ModelSettings } from '@research/model-adapter';
import type { Services } from '../apps/api/src/services/index.js';
export function createHostedPlatform(options?: {
  env?: Record<string, string | undefined>;
  generatorOverride?: LanguageGenerator;
  poolOverride?: Pool;
  modelTransportOverride?: typeof fetch;
}): Promise<{
  app: Express;
  pool: Pool;
  services: Services;
  settings: ModelSettings;
  previewBatches: {
    experiment_id: string;
    batch: string;
    profile: string;
    accounts: {
      participant_id: string;
      participant_code: string;
      path: string;
      password: string;
    }[];
  }[];
  seed: {
    experiment_id: string;
    batch: string;
    profile: string;
    accounts: {
      participant_id: string;
      participant_code: string;
      path: string;
      password: string;
    }[];
  };
}>;

export const createHostedDeployment: typeof createHostedPlatform;
