import { test, expect } from 'vitest';
import {
  classifyStagingChanges,
  evaluateStagingIteration,
  validStagingReceipt,
} from '../../../scripts/staging-iteration-policy.mjs';
const commit = 'a'.repeat(40),
  live = 'b'.repeat(40);
function receipt() {
  return {
    scope: 'internal-staging-test-data-only',
    database_alias: 'ai-agent-research-staging-db',
    database_name: 'ai_agent_research',
    source_postgres_major: 18,
    pg_dump_version: 'pg_dump (PostgreSQL) 18.6',
    pg_restore_version: 'pg_restore (PostgreSQL) 18.6',
    pg_dump_exit_code: 0,
    pg_restore_list_exit_code: 0,
    bytes: 1000,
    sha256: 'c'.repeat(64),
    created_at_utc: '2026-10-22T00:00:00Z',
    object_summary: { research_data_present: true, migration_ledger_data_present: true },
    full_restore_verified: false,
  };
}
function record(files: string[]) {
  return {
    deployment_environment: 'staging',
    implementation_commit: commit,
    baseline_live_commit: live,
    automation: {
      command: 'npm run check',
      exit_code: 0,
      vitest_tests: 1,
      browser_tests: 1,
      log: 'check.log',
      scope: 'local',
    },
    paths: { cognitive: 'PASS', emotional: 'PASS', daily: 'PASS' },
    ...classifyStagingChanges(files),
    source_database_verified: true,
    migration_reviewed: true,
    initial_real_backup_verified: true,
    initial_backup_receipt: receipt(),
    backup_receipt: receipt(),
    backup_live_commit: live,
    presentation_or_model_changed: false,
  };
}
test('UI-only Staging change reuses the first verified real backup without demanding another restore drill', () => {
  const files = ['apps/web/src/Participant.tsx'];
  const r = record(files);
  const result = evaluateStagingIteration(r, commit, files);
  expect(result.can_request_deployment).toBe(true);
  expect(result.fresh_backup_required).toBe(false);
  expect(result.deployment_authorized).toBe(false);
  expect(result.formal_ready).toBe(false);
});
test('first real backup is mandatory even for a UI-only update', () => {
  const files = ['apps/web/src/styles.css'];
  const r = record(files);
  r.initial_real_backup_verified = false;
  expect(evaluateStagingIteration(r, commit, files).can_request_deployment).toBe(false);
});
test.each([
  'database/migrations/004_chat_timeline.up.sql',
  'apps/api/src/services/account-service.ts',
  'apps/api/src/repositories/conversation-repository.ts',
])('risk change %s requires a fresh current-Live backup', (path) => {
  const files = [path];
  const r = record(files);
  r.backup_live_commit = 'd'.repeat(40);
  const result = evaluateStagingIteration(r, commit, files);
  expect(result.fresh_backup_required).toBe(true);
  expect(result.can_request_deployment).toBe(false);
});
test('a fresh minimum Staging receipt can pass without a full Production restore', () => {
  const files = ['database/migrations/004_chat_timeline.up.sql'];
  const r = record(files);
  expect(evaluateStagingIteration(r, commit, files).can_request_deployment).toBe(true);
});
test('false self-declared change flags cannot bypass the Git-derived migration review', () => {
  const files = ['database/migrations/new.sql'];
  const r = record(files);
  r.migration_changed = false;
  expect(evaluateStagingIteration(r, commit, files).blocked).toContain(
    'CHANGE_CLASSIFICATION_MIGRATION_CHANGED',
  );
});
test('synthetic, empty and PG17 receipts cannot stand in for real PG18 backups', () => {
  const r = receipt();
  r.scope = 'synthetic-local-pg18';
  expect(validStagingReceipt(r)).toBe(false);
  r.scope = 'internal-staging-test-data-only';
  r.bytes = 0;
  expect(validStagingReceipt(r)).toBe(false);
  r.bytes = 1000;
  r.source_postgres_major = 17;
  expect(validStagingReceipt(r)).toBe(false);
});
test('a failing regression still blocks Staging', () => {
  const files: string[] = [];
  const r = record(files);
  r.automation.exit_code = 1;
  expect(evaluateStagingIteration(r, commit, files).can_request_deployment).toBe(false);
});
