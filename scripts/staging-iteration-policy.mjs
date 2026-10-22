// Read-only Staging policy. Does not deploy, connect, create resources or alter secrets.
export function classifyStagingChanges(files) {
  return {
    database_schema_changed: files.some((p) => /^(database\/|packages\/database\/src\/)/.test(p)),
    migration_changed: files.some((p) => /^database\/migrations\//.test(p)),
    account_or_persistence_changed: files.some((p) =>
      /^(apps\/api\/src\/(repositories\/|services\/(account|participant|conversation|experiment|admin|model-run)-service\.|controllers\/routes\.|server\.)|scripts\/hosted-(platform|server)\.)/.test(
        p,
      ),
    ),
  };
}
export function validStagingReceipt(r) {
  return Boolean(
    r &&
    r.scope === 'internal-staging-test-data-only' &&
    r.database_alias === 'ai-agent-research-staging-db' &&
    r.database_name === 'ai_agent_research' &&
    r.source_postgres_major === 18 &&
    /PostgreSQL\) 18(?:\.|\s|$)/.test(r.pg_dump_version ?? '') &&
    /PostgreSQL\) 18(?:\.|\s|$)/.test(r.pg_restore_version ?? '') &&
    r.pg_dump_exit_code === 0 &&
    r.pg_restore_list_exit_code === 0 &&
    Number.isSafeInteger(r.bytes) &&
    r.bytes > 5 &&
    /^[a-f0-9]{64}$/.test(r.sha256 ?? '') &&
    Number.isFinite(Date.parse(r.created_at_utc)) &&
    r.object_summary?.research_data_present === true &&
    r.object_summary?.migration_ledger_data_present === true,
  );
}
export function evaluateStagingIteration(record, expectedCommit, changedFiles) {
  const flags = classifyStagingChanges(changedFiles);
  const blocked = [];
  const need = (ok, reason) => {
    if (!ok) blocked.push(reason);
  };
  need(
    /^[a-f0-9]{40}$/.test(expectedCommit ?? '') && record?.implementation_commit === expectedCommit,
    'TARGET_COMMIT_REQUIRED',
  );
  need(/^[a-f0-9]{40}$/.test(record?.baseline_live_commit ?? ''), 'LIVE_BASELINE_REQUIRED');
  need(record?.deployment_environment === 'staging', 'STAGING_ONLY');
  const a = record?.automation;
  need(
    a?.command === 'npm run check' &&
      a.exit_code === 0 &&
      a.vitest_tests > 0 &&
      a.browser_tests > 0 &&
      a.log &&
      a.scope === 'local',
    'FULL_REGRESSION_REQUIRED',
  );
  for (const path of ['cognitive', 'emotional', 'daily'])
    need(record?.paths?.[path] === 'PASS', 'PATH_' + path.toUpperCase());
  for (const field of Object.keys(flags))
    need(record?.[field] === flags[field], 'CHANGE_CLASSIFICATION_' + field.toUpperCase());
  need(record?.source_database_verified === true, 'SOURCE_DATABASE_REQUIRED');
  need(record?.migration_reviewed === true, 'MIGRATION_RISK_REVIEW_REQUIRED');
  need(
    record?.initial_real_backup_verified === true &&
      validStagingReceipt(record?.initial_backup_receipt),
    'FIRST_REAL_PG18_BACKUP_REQUIRED',
  );
  const freshRequired = Object.values(flags).some(Boolean);
  if (freshRequired) {
    need(
      validStagingReceipt(record?.backup_receipt) &&
        record?.backup_live_commit === record?.baseline_live_commit,
      'FRESH_BACKUP_FOR_CURRENT_LIVE_REQUIRED',
    );
  }
  if (record?.presentation_or_model_changed !== false) {
    need(
      record?.real_model?.status === 'PASS' &&
        record.real_model.commit === expectedCommit &&
        record.real_model.affected_paths_complete === true &&
        record.real_model.evidence,
      'AFFECTED_REAL_MODEL_FORMAT_REQUIRED',
    );
  }
  return {
    conclusion: blocked.length
      ? '仍阻塞：等待真实备份'
      : '可申请 Staging 部署：备份已由研究者完成并验证',
    flags,
    fresh_backup_required: freshRequired,
    can_request_deployment: blocked.length === 0,
    deployment_authorized: false,
    production_ready: false,
    mentor_test_ready: false,
    formal_ready: false,
    note: 'Evidence gate only; receipt must be researcher-verified. Manual deployment and post-deploy human smoke remain separate.',
    blocked,
  };
}
