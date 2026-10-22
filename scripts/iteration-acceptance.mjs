import { execFileSync } from 'node:child_process';
import { evaluateStagingIteration } from './staging-iteration-policy.mjs';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// A read-only evidence gate. It never deploys, changes accounts or opens a database.
export function evaluateIteration(record, expectedCommit) {
  const blocked = [];
  const requireEvidence = (ok, reason) => {
    if (!ok) blocked.push(reason);
  };
  requireEvidence(/^[a-f0-9]{40}$/.test(expectedCommit ?? ''), 'EXPECTED_COMMIT_REQUIRED');
  requireEvidence(record?.implementation_commit === expectedCommit, 'COMMIT_MISMATCH');
  const checks = record?.automation;
  requireEvidence(
    checks?.command === 'npm run check' &&
      checks?.exit_code === 0 &&
      checks?.vitest_tests > 0 &&
      checks?.vitest_files > 0 &&
      checks?.browser_tests > 0 &&
      checks?.log &&
      checks?.scope === 'local',
    'FULL_REGRESSION_REQUIRED',
  );
  for (const path of ['cognitive', 'emotional', 'daily']) {
    requireEvidence(record?.paths?.[path] === 'PASS', `PATH_${path.toUpperCase()}_REQUIRED`);
  }
  if (record?.presentation_or_model_changed !== false) {
    requireEvidence(
      record?.real_model?.status === 'PASS' &&
        record.real_model.commit === expectedCommit &&
        record.real_model.affected_paths_complete === true &&
        record.real_model.evidence,
      'AFFECTED_REAL_MODEL_FORMAT_REQUIRED',
    );
  }
  for (const field of [
    'source_database_verified',
    'branch_and_live_commit_verified',
    'migration_compatibility_verified',
    'full_backup_verified',
    'isolated_restore_verified',
    'old_account_baseline_saved',
    'researcher_approved',
  ]) {
    requireEvidence(record?.predeploy?.[field] === true, `PREDEPLOY_${field.toUpperCase()}`);
  }
  requireEvidence(
    record?.predeploy?.backup_sha256?.match(/^[a-f0-9]{64}$/),
    'BACKUP_CHECKSUM_REQUIRED',
  );
  requireEvidence(record?.predeploy?.backup_evidence, 'BACKUP_EVIDENCE_REQUIRED');
  // Online acceptance is a separate gate; it cannot be replaced by local browser tests.
  const onlineAccepted =
    record?.online?.commit === expectedCommit &&
    record.online.ready === true &&
    record.online.old_accounts === true &&
    record.online.human_smoke === true &&
    Boolean(record.online.evidence);
  return {
    conclusion: blocked.length ? '仍阻塞' : '可部署到内部测试站',
    deployment_eligible: blocked.length === 0,
    online_accepted: Boolean(onlineAccepted),
    mentor_test_ready: false,
    formal_ready: false,
    blocked,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const record = JSON.parse(readFileSync(process.argv[2], 'utf8'));
    const target = process.argv[3];
    let result;
    if (record.deployment_environment === 'staging') {
      if (
        !/^[a-f0-9]{40}$/.test(target ?? '') ||
        !/^[a-f0-9]{40}$/.test(record.baseline_live_commit ?? '')
      )
        throw Error('INVALID_COMMITS');
      const files = execFileSync(
        'git',
        ['diff', '--name-only', '-z', record.baseline_live_commit, target],
        { encoding: 'utf8' },
      )
        .split('\0')
        .filter(Boolean);
      result = evaluateStagingIteration(record, target, files);
    } else {
      result = evaluateIteration(record, target);
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = (
      record.deployment_environment === 'staging'
        ? result.can_request_deployment
        : result.deployment_eligible
    )
      ? 0
      : 2;
  } catch {
    process.stderr.write(
      'Invalid acceptance evidence. Supply a JSON file and full implementation commit.\n',
    );
    process.exitCode = 1;
  }
}
