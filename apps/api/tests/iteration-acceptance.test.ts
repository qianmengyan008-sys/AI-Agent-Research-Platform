import { describe, expect, it } from 'vitest';
import { evaluateIteration } from '../../../scripts/iteration-acceptance.mjs';

const commit = 'a'.repeat(40);
function evidence() {
  return {
    implementation_commit: commit,
    automation: {
      command: 'npm run check',
      exit_code: 0,
      vitest_tests: 1,
      vitest_files: 1,
      browser_tests: 1,
      log: 'redacted-check.log',
      scope: 'local',
    },
    paths: { cognitive: 'PASS', emotional: 'PASS', daily: 'PASS' },
    presentation_or_model_changed: false,
    predeploy: {
      source_database_verified: true,
      branch_and_live_commit_verified: true,
      migration_compatibility_verified: true,
      full_backup_verified: true,
      isolated_restore_verified: true,
      old_account_baseline_saved: true,
      researcher_approved: true,
      backup_sha256: 'b'.repeat(64),
      backup_evidence: 'private evidence receipt',
    },
  };
}

describe('iteration acceptance evidence, not deployment automation', () => {
  it('fails closed on missing evidence', () => {
    expect(evaluateIteration({}, commit).deployment_eligible).toBe(false);
  });
  it('rejects stale commit evidence', () => {
    expect(evaluateIteration(evidence(), 'c'.repeat(40)).blocked).toContain('COMMIT_MISMATCH');
  });
  it('requires a complete successful check, not selected tests', () => {
    const r = evidence();
    r.automation.exit_code = 1;
    expect(evaluateIteration(r, commit).blocked).toContain('FULL_REGRESSION_REQUIRED');
  });
  it.each(['cognitive', 'emotional', 'daily'] as const)('requires %s path regression', (path) => {
    const r = evidence();
    r.paths[path] = 'NOT RUN';
    expect(evaluateIteration(r, commit).deployment_eligible).toBe(false);
  });
  it('requires isolated restore even when dump succeeded', () => {
    const r = evidence();
    r.predeploy.isolated_restore_verified = false;
    expect(evaluateIteration(r, commit).deployment_eligible).toBe(false);
  });
  it('does not permit checksum-free backups or researcher approval substitution', () => {
    const r = evidence();
    r.predeploy.backup_sha256 = '';
    r.predeploy.researcher_approved = false;
    expect(evaluateIteration(r, commit).blocked).toContain('BACKUP_CHECKSUM_REQUIRED');
    expect(evaluateIteration(r, commit).deployment_eligible).toBe(false);
  });
  it('requires new real model evidence after affected rules change', () => {
    const r = evidence();
    r.presentation_or_model_changed = true;
    expect(evaluateIteration(r, commit).blocked).toContain('AFFECTED_REAL_MODEL_FORMAT_REQUIRED');
  });
  it('does not equate local success and deployment eligibility with online or formal acceptance', () => {
    const result = evaluateIteration(evidence(), commit);
    expect(result.deployment_eligible).toBe(true);
    expect(result.online_accepted).toBe(false);
    expect(result.mentor_test_ready).toBe(false);
    expect(result.formal_ready).toBe(false);
  });
});
