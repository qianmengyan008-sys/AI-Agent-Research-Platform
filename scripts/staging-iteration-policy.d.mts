export function classifyStagingChanges(files: string[]): {
  database_schema_changed: boolean;
  migration_changed: boolean;
  account_or_persistence_changed: boolean;
};
export function validStagingReceipt(record: unknown): boolean;
export function evaluateStagingIteration(
  record: unknown,
  expectedCommit: string,
  changedFiles: string[],
): {
  conclusion: string;
  flags: ReturnType<typeof classifyStagingChanges>;
  fresh_backup_required: boolean;
  can_request_deployment: boolean;
  deployment_authorized: false;
  production_ready: false;
  mentor_test_ready: false;
  formal_ready: false;
  note: string;
  blocked: string[];
};
