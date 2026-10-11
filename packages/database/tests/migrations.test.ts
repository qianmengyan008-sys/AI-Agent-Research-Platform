import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cognitiveV1, createInitialState, transition, EventType } from '@research/experiment-core';
import { loadMigrations, migrate } from '../src/migrations.js';
import type { Migration } from '../src/migrations.js';

const image =
  'postgres:17.7-alpine@sha256:bb377b7239d2774ac8cc76f481596ce96c5a6b5e9d141f6d0a0ee371a6e7c0f2';
const container = `research-migration-${randomUUID()}`;
let admin: pg.Client;
let client: pg.Client;
let port: number;
let database: string;
let started = false;
let migrations: readonly Migration[];
const password = 'SYNTHETIC_MIGRATION_ONLY';
const connection = (name: string) => ({
  host: '127.0.0.1',
  port,
  user: 'postgres',
  password,
  database: name,
  connectionTimeoutMillis: 1000,
});
async function seed(publish = true) {
  const experiment = (
    await client.query(
      "INSERT INTO research.experiment(name) VALUES('Synthetic experiment') RETURNING id",
    )
  ).rows[0].id as string;
  const template = (
    await client.query(
      "INSERT INTO research.template_version(experiment_id,version,configuration,content_hash) VALUES($1,1,'{}',$2) RETURNING id",
      [experiment, 'a'.repeat(64)],
    )
  ).rows[0].id as string;
  const agent = (
    await client.query(
      "INSERT INTO research.agent(experiment_id,name) VALUES($1,'Synthetic Agent') RETURNING id",
      [experiment],
    )
  ).rows[0].id as string;
  const agentVersion = (
    await client.query(
      "INSERT INTO research.agent_version(experiment_id,agent_id,personality_version,configuration,content_hash) VALUES($1,$2,'1','{}',$3) RETURNING id",
      [experiment, agent, 'b'.repeat(64)],
    )
  ).rows[0].id as string;
  const snapshot = createInitialState(cognitiveV1);
  const machine = (
    await client.query(
      'INSERT INTO research.state_machine_version(experiment_id,core_experiment_version,path_type,definition,definition_signature,content_hash) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
      [
        experiment,
        cognitiveV1.experimentVersion,
        cognitiveV1.path,
        JSON.stringify(cognitiveV1),
        snapshot.definitionSignature,
        'c'.repeat(64),
      ],
    )
  ).rows[0].id as string;
  const prompt = (
    await client.query(
      "INSERT INTO research.prompt_version(experiment_id,state_machine_version_id,stage,version,policy,content_hash) VALUES($1,$2,'STEREOTYPE_CAPTURE','stage-language-v3','{}',$3) RETURNING id",
      [experiment, machine, 'd'.repeat(64)],
    )
  ).rows[0].id as string;
  const condition = (
    await client.query(
      "INSERT INTO research.condition(experiment_id,template_version_id,code,state_machine_version_id,agent_version_id,configuration) VALUES($1,$2,'A',$3,$4,'{}') RETURNING id",
      [experiment, template, machine, agentVersion],
    )
  ).rows[0].id as string;
  await client.query(
    "INSERT INTO research.condition_prompt(condition_id,experiment_id,prompt_version_id,stage) VALUES($1,$2,$3,'STEREOTYPE_CAPTURE')",
    [condition, experiment, prompt],
  );
  if (publish)
    await client.query(
      "UPDATE research.template_version SET status='published',published_at=now() WHERE id=$1",
      [template],
    );
  const participant = (
    await client.query(
      "INSERT INTO research.participant(experiment_id,participant_code,password_hash) VALUES($1,'P001','SYNTHETIC_HASH') RETURNING id",
      [experiment],
    )
  ).rows[0].id as string;
  return { experiment, template, agentVersion, machine, prompt, condition, participant, snapshot };
}
async function runtime() {
  const s = await seed();
  const assignment = (
    await client.query(
      "INSERT INTO research.experiment_assignment(experiment_id,participant_id,template_version_id,condition_id,assigned_by) VALUES($1,$2,$3,$4,'synthetic-admin') RETURNING id",
      [s.experiment, s.participant, s.template, s.condition],
    )
  ).rows[0].id as string;
  const session = (
    await client.query(
      'INSERT INTO research.experiment_session(assignment_id,experiment_id) VALUES($1,$2) RETURNING id',
      [assignment, s.experiment],
    )
  ).rows[0].id as string;
  await client.query(
    'INSERT INTO research.experiment_state(session_id,stage,core_version,snapshot) VALUES($1,$2,$3,$4)',
    [session, s.snapshot.stage, s.snapshot.version, JSON.stringify(s.snapshot)],
  );
  const conversation = (
    await client.query('INSERT INTO research.conversation(session_id) VALUES($1) RETURNING id', [
      session,
    ])
  ).rows[0].id as string;
  return { ...s, assignment, session, conversation };
}
async function turn(session: string) {
  return (
    await client.query(
      "INSERT INTO research.conversation_turn(session_id,idempotency_key,request_hash,accepted_core_version,chat_revision,status) VALUES($1,'turn-1',$2,0,1,'ready') RETURNING id",
      [session, 'e'.repeat(64)],
    )
  ).rows[0].id as string;
}
beforeAll(async () => {
  // No silent skip: required migration tests fail if Docker/PostgreSQL cannot start.
  execFileSync(
    'docker',
    [
      'run',
      '--rm',
      '-d',
      '--name',
      container,
      '--tmpfs',
      '/var/lib/postgresql/data',
      '-p',
      '127.0.0.1::5432',
      '-e',
      `POSTGRES_PASSWORD=${password}`,
      image,
    ],
    { stdio: 'pipe', timeout: 60000 },
  );
  started = true;
  port = Number(
    execFileSync('docker', ['port', container, '5432/tcp'], { encoding: 'utf8' })
      .trim()
      .split(':')
      .at(-1),
  );
  let ready = false;
  for (let i = 0; i < 60; i++) {
    const candidate = new pg.Client(connection('postgres'));
    try {
      await candidate.connect();
      admin = candidate;
      ready = true;
      break;
    } catch {
      await candidate.end();
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  if (!ready) throw new Error('Isolated PostgreSQL did not become ready');
  migrations = await loadMigrations(
    fileURLToPath(new URL('../../../database/migrations/', import.meta.url)),
  );
}, 60000);
beforeEach(async () => {
  database = `test_${randomUUID().replaceAll('-', '')}`;
  await admin.query(`CREATE DATABASE ${database}`);
  client = new pg.Client(connection(database));
  await client.connect();
  await migrate(client, migrations);
});
afterEach(async () => {
  await client?.end();
  if (database && admin) await admin.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
});
afterAll(async () => {
  await admin?.end();
  if (started) execFileSync('docker', ['rm', '-f', container], { stdio: 'pipe' });
});
describe('PostgreSQL 17 migration and storage integration', () => {
  it('creates all 19 configuration and runtime tables on an empty database', async () => {
    const rows = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='research' AND table_type='BASE TABLE'",
    );
    expect(rows.rows).toHaveLength(19);
    expect((await client.query('SHOW server_version')).rows[0].server_version).toMatch(/^17\.7/);
  });
  it('repeated up is idempotent and retains checksummed ledger entries', async () => {
    const output = execFileSync('npm', ['run', 'db:migrate', '--', 'up'], {
      cwd: fileURLToPath(new URL('../../../', import.meta.url)),
      encoding: 'utf8',
      timeout: 20000,
      env: {
        ...process.env,
        DATABASE_URL: `postgresql://postgres:${password}@127.0.0.1:${port}/${database}`,
      },
    });
    expect(output).toContain('"applied":[]');
    expect((await migrate(client, migrations)).applied).toEqual([]);
    expect((await client.query('SELECT * FROM research_meta.schema_migration')).rows).toHaveLength(
      2,
    );
  });
  it('rejects tampered migration history', async () => {
    await client.query(
      "UPDATE research_meta.schema_migration SET checksum='tampered' WHERE id=$1",
      [migrations[0]!.id],
    );
    await expect(migrate(client, migrations)).rejects.toThrow('checksum mismatch');
  });
  it('rolls back a failed migration DDL and ledger entry atomically', async () => {
    const broken = {
      id: '003_failure',
      up: 'CREATE TABLE research.should_rollback(id int); SELECT nonexistent_column;',
      down: 'DROP TABLE research.should_rollback;',
      checksum: 'synthetic',
    };
    await expect(migrate(client, [...migrations, broken])).rejects.toThrow();
    expect(
      (await client.query("SELECT to_regclass('research.should_rollback') AS relation")).rows[0]
        .relation,
    ).toBeNull();
    expect((await client.query('SELECT * FROM research_meta.schema_migration')).rows).toHaveLength(
      2,
    );
  });
  it('supports reverse rollback and clean reapplication', async () => {
    expect((await migrate(client, migrations, 'down')).applied).toEqual(['002_runtime']);
    expect((await migrate(client, migrations, 'down')).applied).toEqual(['001_configuration']);
    expect((await migrate(client, migrations)).applied).toHaveLength(2);
  });
  it('does not allow assignments to draft configurations', async () => {
    const s = await seed(false);
    await expect(
      client.query(
        "INSERT INTO research.experiment_assignment(experiment_id,participant_id,template_version_id,condition_id,assigned_by) VALUES($1,$2,$3,$4,'admin')",
        [s.experiment, s.participant, s.template, s.condition],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });
  it('rejects cross-experiment participant assignment', async () => {
    const a = await seed();
    const b = await seed();
    await expect(
      client.query(
        "INSERT INTO research.experiment_assignment(experiment_id,participant_id,template_version_id,condition_id,assigned_by) VALUES($1,$2,$3,$4,'admin')",
        [a.experiment, b.participant, a.template, a.condition],
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });
  it.each(['template', 'condition', 'prompt'])('freezes published %s records', async (kind) => {
    const s = await seed();
    const sql =
      kind === 'template'
        ? "UPDATE research.template_version SET configuration='{}' WHERE id=$1"
        : kind === 'condition'
          ? "UPDATE research.condition SET code='B' WHERE id=$1"
          : "UPDATE research.prompt_version SET policy='{}' WHERE id=$1";
    await expect(
      client.query(sql, [
        kind === 'template' ? s.template : kind === 'condition' ? s.condition : s.prompt,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
  });
  it('prevents assignment rewrites after pinning', async () => {
    const s = await runtime();
    await expect(
      client.query("UPDATE research.experiment_assignment SET assigned_by='other' WHERE id=$1", [
        s.assignment,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
  });
  it('restores an exact core snapshot through a new connection and accepts the next legal event', async () => {
    const s = await runtime();
    await client.end();
    client = new pg.Client(connection(database));
    await client.connect();
    const stored = (
      await client.query('SELECT snapshot FROM research.experiment_state WHERE session_id=$1', [
        s.session,
      ])
    ).rows[0].snapshot;
    expect(stored).toEqual(s.snapshot);
    const next = transition(
      stored,
      {
        id: 'start-1',
        type: EventType.EXPERIMENT_STARTED,
        experimentVersion: cognitiveV1.experimentVersion,
        expectedStateVersion: 0,
      },
      {},
      cognitiveV1,
    );
    expect(next.ok).toBe(true);
  });
  it('rolls back state, transition and variable when a transaction fails', async () => {
    const s = await runtime();
    await client.query('BEGIN');
    await client.query('UPDATE research.experiment_session SET chat_revision=1 WHERE id=$1', [
      s.session,
    ]);
    const next = transition(
      s.snapshot,
      {
        id: 'atomic-start',
        type: EventType.EXPERIMENT_STARTED,
        experimentVersion: cognitiveV1.experimentVersion,
        expectedStateVersion: 0,
      },
      {},
      cognitiveV1,
    );
    expect(next.ok).toBe(true);
    await client.query(
      'UPDATE research.experiment_state SET stage=$2,core_version=$3,snapshot=$4 WHERE session_id=$1',
      [s.session, next.newState.stage, next.newState.version, JSON.stringify(next.newState)],
    );
    await client.query(
      "INSERT INTO research.state_transition(session_id,core_event_id,event,previous_state,current_state,from_version,to_version,actor_type,actor_id,validated_payload,receipt) VALUES($1,'atomic-start','EXPERIMENT_STARTED','INIT','STEREOTYPE_CAPTURE',0,1,'backend','test','{}',$2)",
      [s.session, JSON.stringify(next.newState.receipts[0])],
    );
    await expect(
      client.query(
        "INSERT INTO research.experiment_variable(session_id,key,value,revision,source_transition_id,recorded_stage) VALUES($1,'x','1',1,$2,'INIT')",
        [s.session, randomUUID()],
      ),
    ).rejects.toMatchObject({ code: '23503' });
    await client.query('ROLLBACK');
    expect(
      (await client.query('SELECT snapshot FROM research.experiment_state')).rows[0].snapshot,
    ).toEqual(s.snapshot);
    expect((await client.query('SELECT * FROM research.state_transition')).rows).toHaveLength(0);
    expect((await client.query('SELECT * FROM research.experiment_variable')).rows).toHaveLength(0);
    expect(
      (
        await client.query('SELECT chat_revision FROM research.experiment_session WHERE id=$1', [
          s.session,
        ])
      ).rows[0].chat_revision,
    ).toBe(0);
  });
  it('preserves immutable distinct first and second ratings and the frozen belief', async () => {
    const s = await runtime();
    const event = (
      await client.query(
        "INSERT INTO research.state_transition(session_id,core_event_id,event,previous_state,current_state,from_version,to_version,actor_type,actor_id,validated_payload,receipt) VALUES($1,'synthetic-event','SYNTHETIC','INIT','STEREOTYPE_CAPTURE',0,1,'backend','test','{}','{}') RETURNING id",
        [s.session],
      )
    ).rows[0].id;
    for (const [key, value] of [
      ['initial_rating', 5],
      ['second_rating', 3],
      ['confirmed_viewpoint', 'frozen'],
    ] as const)
      await client.query(
        "INSERT INTO research.experiment_variable(session_id,key,value,revision,source_transition_id,recorded_stage) VALUES($1,$2,$3,1,$4,'synthetic')",
        [s.session, key, JSON.stringify(value), event],
      );
    await expect(
      client.query("UPDATE research.experiment_variable SET value='7' WHERE key='initial_rating'"),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      client.query(
        "INSERT INTO research.experiment_variable(session_id,key,value,revision,source_transition_id,recorded_stage) VALUES($1,'confirmed_viewpoint','\"replacement\"',2,$2,'synthetic')",
        [s.session, event],
      ),
    ).rejects.toMatchObject({ code: '23505' });
    expect(
      (await client.query('SELECT key,value FROM research.experiment_variable ORDER BY key')).rows,
    ).toHaveLength(3);
  });
  it('isolates model failure from state and variables and records unknown token usage as null', async () => {
    const s = await runtime();
    const t = await turn(s.session);
    await client.query(
      "INSERT INTO research.model_run_log(turn_id,session_id,experiment_id,provider,model_name,prompt_version_id,prompt_version,validator_version,code_commit,temperature,max_tokens,latency_ms,retry_count,fallback_count,validator_result,error_code,status) VALUES($1,$3,$4,'mock','synthetic',$2,'v3','guard-v3','test',0.2,512,10,1,1,'{}','MODEL_GENERATION_FAILED','failed')",
      [t, s.prompt, s.session, s.experiment],
    );
    expect(
      (await client.query('SELECT snapshot FROM research.experiment_state')).rows[0].snapshot,
    ).toEqual(s.snapshot);
    expect((await client.query('SELECT * FROM research.experiment_variable')).rows).toHaveLength(0);
    expect(
      (await client.query('SELECT token_usage FROM research.model_run_log')).rows[0].token_usage,
    ).toBeNull();
  });
  it('stores messages with sequence uniqueness and a restricted participant projection', async () => {
    const s = await runtime();
    const t = await turn(s.session);
    await client.query(
      "INSERT INTO research.message(session_id,conversation_id,turn_id,sequence,role,content,status) VALUES($1,$2,$3,1,'user','synthetic hello','ready')",
      [s.session, s.conversation, t],
    );
    const { rows } = await client.query('SELECT * FROM research.participant_message');
    expect(Object.keys(rows[0])).toEqual([
      'id',
      'session_id',
      'sequence',
      'role',
      'content',
      'created_at',
    ]);
    await expect(
      client.query(
        "INSERT INTO research.message(session_id,conversation_id,turn_id,sequence,role,content,status) VALUES($1,$2,$3,1,'assistant','duplicate','ready')",
        [s.session, s.conversation, t],
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });
  it('enforces observer database privilege boundaries without claiming participant row authorization', async () => {
    await client.query('CREATE ROLE migration_test_observer');
    try {
      await client.query('GRANT USAGE ON SCHEMA research TO migration_test_observer');
      await client.query('GRANT SELECT ON research.participant_message TO migration_test_observer');
      await client.query('SET ROLE migration_test_observer');
      await expect(
        client.query('SELECT * FROM research.participant_message'),
      ).resolves.toBeDefined();
      await expect(client.query('SELECT * FROM research.participant')).rejects.toMatchObject({
        code: '42501',
      });
      await expect(
        client.query("UPDATE research.experiment_state SET stage='COMPLETED'"),
      ).rejects.toMatchObject({ code: '42501' });
    } finally {
      await client.query('RESET ROLE');
      await client.query('DROP OWNED BY migration_test_observer');
      await client.query('DROP ROLE migration_test_observer');
    }
  });
  it('serializes concurrent migration processes with the advisory lock', async () => {
    const other = new pg.Client(connection(database));
    await other.connect();
    try {
      const results = await Promise.all([migrate(client, migrations), migrate(other, migrations)]);
      expect(results.every((r) => r.applied.length === 0)).toBe(true);
      expect(
        (await client.query('SELECT * FROM research_meta.schema_migration')).rows,
      ).toHaveLength(2);
    } finally {
      await other.end();
    }
  });
  it('cannot redirect a session to another assignment', async () => {
    const a = await runtime();
    const b = await runtime();
    await expect(
      client.query('UPDATE research.experiment_session SET assignment_id=$2 WHERE id=$1', [
        a.session,
        b.assignment,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
  });
  it('rejects a model log linked to another experiment prompt', async () => {
    const a = await runtime();
    const b = await runtime();
    const t = await turn(a.session);
    await expect(
      client.query(
        "INSERT INTO research.model_run_log(turn_id,session_id,experiment_id,provider,model_name,prompt_version_id,prompt_version,validator_version,code_commit,temperature,max_tokens,latency_ms,retry_count,fallback_count,validator_result,status) VALUES($1,$2,$3,'mock','synthetic',$4,'v3','guard-v3','test',0.2,512,1,0,0,'{}','generated')",
        [t, a.session, a.experiment, b.prompt],
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });
});
