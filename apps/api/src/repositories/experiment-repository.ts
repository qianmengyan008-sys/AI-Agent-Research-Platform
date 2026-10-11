import type { PoolClient } from 'pg';
import type { ExperimentDefinition } from '@research/experiment-core';
import type { StagePolicy } from '@research/ai-orchestrator';
import type { ModelSettings } from '@research/model-adapter';
export interface Configuration {
  instructions: string;
  model: ModelSettings;
  policiesAreDemo: boolean;
}
export class ExperimentRepository {
  constructor(private readonly db: PoolClient) {}
  async create(name: string, configuration: Configuration, checksum: string) {
    const experiment = (
      await this.db.query<{ id: string }>(
        'INSERT INTO research.experiment(name) VALUES($1) RETURNING id',
        [name],
      )
    ).rows[0]!;
    const template = (
      await this.db.query<{ id: string }>(
        'INSERT INTO research.template_version(experiment_id,version,configuration,content_hash) VALUES($1,1,$2,$3) RETURNING id',
        [experiment.id, JSON.stringify(configuration), checksum],
      )
    ).rows[0]!;
    return { experimentId: experiment.id, templateId: template.id };
  }
  async template(experiment: string, lock = false) {
    return (
      await this.db.query<{ id: string; status: string; configuration: Configuration }>(
        'SELECT id,status,configuration FROM research.template_version WHERE experiment_id=$1 ORDER BY version DESC LIMIT 1' +
          (lock ? ' FOR UPDATE' : ''),
        [experiment],
      )
    ).rows[0];
  }
  async condition(
    experiment: string,
    template: string,
    code: string,
    definition: ExperimentDefinition,
    signature: string,
    name: string,
    policies: readonly StagePolicy[],
    checksum: (x: unknown) => string,
  ) {
    const a = (
      await this.db.query<{ id: string }>(
        'INSERT INTO research.agent(experiment_id,name) VALUES($1,$2) RETURNING id',
        [experiment, name],
      )
    ).rows[0]!;
    const av = (
      await this.db.query<{ id: string }>(
        "INSERT INTO research.agent_version(experiment_id,agent_id,personality_version,configuration,content_hash) VALUES($1,$2,'1',$3,$4) RETURNING id",
        [experiment, a.id, JSON.stringify({ name }), checksum({ name })],
      )
    ).rows[0]!;
    await this.db.query(
      'INSERT INTO research.state_machine_version(experiment_id,core_experiment_version,path_type,definition,definition_signature,content_hash) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(experiment_id,core_experiment_version) DO NOTHING',
      [
        experiment,
        definition.experimentVersion,
        definition.path,
        JSON.stringify(definition),
        signature,
        checksum(definition),
      ],
    );
    const sm = (
      await this.db.query<{ id: string }>(
        'SELECT id FROM research.state_machine_version WHERE experiment_id=$1 AND core_experiment_version=$2',
        [experiment, definition.experimentVersion],
      )
    ).rows[0]!;
    const c = (
      await this.db.query<{ id: string }>(
        "INSERT INTO research.condition(experiment_id,template_version_id,code,state_machine_version_id,agent_version_id,configuration) VALUES($1,$2,$3,$4,$5,'{}') RETURNING id",
        [experiment, template, code, sm.id, av.id],
      )
    ).rows[0]!;
    for (const policy of policies) {
      const version = `stage-language-v3-${checksum(policy)}`;
      await this.db.query(
        'INSERT INTO research.prompt_version(experiment_id,state_machine_version_id,stage,version,policy,content_hash) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(state_machine_version_id,stage,version) DO NOTHING',
        [experiment, sm.id, policy.stage, version, JSON.stringify(policy), checksum(policy)],
      );
      const p = (
        await this.db.query<{ id: string }>(
          'SELECT id FROM research.prompt_version WHERE state_machine_version_id=$1 AND stage=$2 AND version=$3',
          [sm.id, policy.stage, version],
        )
      ).rows[0]!;
      await this.db.query(
        'INSERT INTO research.condition_prompt(condition_id,experiment_id,prompt_version_id,stage) VALUES($1,$2,$3,$4)',
        [c.id, experiment, p.id, policy.stage],
      );
    }
    return { conditionId: c.id };
  }
  async conditions(template: string) {
    return (
      await this.db.query<{
        id: string;
        definition: ExperimentDefinition;
        policies: StagePolicy[];
      }>(
        `SELECT c.id,sm.definition,
      (SELECT jsonb_agg(p.policy ORDER BY p.stage) FROM research.condition_prompt cp JOIN research.prompt_version p ON p.id=cp.prompt_version_id WHERE cp.condition_id=c.id) AS policies
      FROM research.condition c JOIN research.state_machine_version sm ON sm.id=c.state_machine_version_id WHERE c.template_version_id=$1`,
        [template],
      )
    ).rows;
  }
  async publish(template: string, checksum: string) {
    await this.db.query(
      "UPDATE research.template_version SET status='published',published_at=now(),content_hash=$2 WHERE id=$1",
      [template, checksum],
    );
  }
  async assignmentConfiguration(condition: string) {
    return (
      await this.db.query<{
        experiment_id: string;
        template_version_id: string;
        definition: ExperimentDefinition;
        status: string;
      }>(
        `SELECT c.experiment_id,c.template_version_id,sm.definition,t.status FROM research.condition c JOIN research.template_version t ON t.id=c.template_version_id JOIN research.state_machine_version sm ON sm.id=c.state_machine_version_id WHERE c.id=$1`,
        [condition],
      )
    ).rows[0];
  }
  async list() {
    return (
      await this.db.query(
        'SELECT e.id,e.name,t.version,t.status FROM research.experiment e JOIN research.template_version t ON t.experiment_id=e.id ORDER BY e.created_at DESC LIMIT 100',
      )
    ).rows as Record<string, unknown>[];
  }
  async audit(experiment: string, actor: string, event: string, reason: string) {
    await this.db.query(
      'INSERT INTO research.admin_event(experiment_id,actor_id,event,reason) VALUES($1,$2,$3,$4)',
      [experiment, actor, event, reason],
    );
  }
}
