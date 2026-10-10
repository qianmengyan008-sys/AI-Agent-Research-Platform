/** Shared API types. Clients cannot use these types to change server-side state. */
export type ExperimentPath = 'cognitive' | 'emotional' | 'daily';

/** Process health only; this does not indicate database or experiment readiness. */
export interface HealthResponse {
  status: 'ok';
  service: 'research-api';
  mode: 'scaffold';
}
