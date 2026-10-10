import type { ExperimentPath } from '@research/contracts';

/** Domain boundary for Step 2. No transition logic or model calls exist yet. */
export interface ExperimentStateSnapshot {
  readonly path: ExperimentPath;
  readonly stage: string;
  readonly lifecycle: 'assigned' | 'active' | 'completed' | 'terminated';
  readonly version: number;
}
