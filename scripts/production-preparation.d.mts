import type { Express } from 'express';
import type { Pool } from 'pg';
export function createProductionPreparation(
  env: Record<string, string | undefined>,
  pool: Pick<Pool, 'query'>,
): Express;
