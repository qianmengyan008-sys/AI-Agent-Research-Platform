CREATE SCHEMA research;
CREATE TABLE research.experiment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE research.template_version (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), experiment_id uuid NOT NULL REFERENCES research.experiment(id),
  version integer NOT NULL CHECK (version > 0), status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  configuration jsonb NOT NULL CHECK (jsonb_typeof(configuration) = 'object'),
  content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'), published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'published') = (published_at IS NOT NULL)), UNIQUE (experiment_id,version), UNIQUE (id,experiment_id)
);
CREATE TABLE research.agent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), experiment_id uuid NOT NULL REFERENCES research.experiment(id),
  name text NOT NULL, avatar text, UNIQUE(id,experiment_id)
);
CREATE TABLE research.agent_version (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), experiment_id uuid NOT NULL,
  agent_id uuid NOT NULL, personality_version text NOT NULL, configuration jsonb NOT NULL CHECK (jsonb_typeof(configuration)='object'),
  content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'), created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (agent_id,experiment_id) REFERENCES research.agent(id,experiment_id),
  UNIQUE(agent_id,personality_version), UNIQUE(id,experiment_id)
);
CREATE TABLE research.state_machine_version (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), experiment_id uuid NOT NULL REFERENCES research.experiment(id),
  core_experiment_version text NOT NULL, path_type text NOT NULL CHECK (path_type IN ('cognitive','emotional','daily')),
  definition jsonb NOT NULL CHECK (jsonb_typeof(definition)='object'), definition_signature text NOT NULL,
  content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(experiment_id,core_experiment_version), UNIQUE(id,experiment_id)
);
CREATE TABLE research.prompt_version (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), experiment_id uuid NOT NULL,
  state_machine_version_id uuid NOT NULL, stage text NOT NULL, version text NOT NULL,
  policy jsonb NOT NULL CHECK (jsonb_typeof(policy)='object'),
  content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'), created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(state_machine_version_id,experiment_id) REFERENCES research.state_machine_version(id,experiment_id),
  UNIQUE(state_machine_version_id,stage,version), UNIQUE(id,experiment_id)
);
CREATE TABLE research.condition (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), experiment_id uuid NOT NULL,
  template_version_id uuid NOT NULL, code text NOT NULL, state_machine_version_id uuid NOT NULL, agent_version_id uuid NOT NULL,
  configuration jsonb NOT NULL CHECK (jsonb_typeof(configuration)='object'),
  FOREIGN KEY(template_version_id,experiment_id) REFERENCES research.template_version(id,experiment_id),
  FOREIGN KEY(state_machine_version_id,experiment_id) REFERENCES research.state_machine_version(id,experiment_id),
  FOREIGN KEY(agent_version_id,experiment_id) REFERENCES research.agent_version(id,experiment_id),
  UNIQUE(template_version_id,code), UNIQUE(id,experiment_id), UNIQUE(id,template_version_id,experiment_id)
);
CREATE TABLE research.condition_prompt (
  condition_id uuid NOT NULL, experiment_id uuid NOT NULL, prompt_version_id uuid NOT NULL,
  stage text NOT NULL, PRIMARY KEY(condition_id,stage),
  FOREIGN KEY(condition_id,experiment_id) REFERENCES research.condition(id,experiment_id),
  FOREIGN KEY(prompt_version_id,experiment_id) REFERENCES research.prompt_version(id,experiment_id)
);
CREATE FUNCTION research.append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'immutable research record' USING ERRCODE='23514'; END;
$$;
CREATE TRIGGER immutable_agent_version BEFORE UPDATE OR DELETE ON research.agent_version FOR EACH ROW EXECUTE FUNCTION research.append_only();
CREATE TRIGGER immutable_machine_version BEFORE UPDATE OR DELETE ON research.state_machine_version FOR EACH ROW EXECUTE FUNCTION research.append_only();
CREATE TRIGGER immutable_prompt_version BEFORE UPDATE OR DELETE ON research.prompt_version FOR EACH ROW EXECUTE FUNCTION research.append_only();
CREATE FUNCTION research.guard_template() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status='published' THEN RAISE EXCEPTION 'published template is immutable' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF NEW.id<>OLD.id OR NEW.experiment_id<>OLD.experiment_id OR NEW.version<>OLD.version THEN
    RAISE EXCEPTION 'template identity is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER immutable_published_template BEFORE UPDATE OR DELETE ON research.template_version FOR EACH ROW EXECUTE FUNCTION research.guard_template();
CREATE FUNCTION research.guard_condition() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v uuid; e uuid; s text;
BEGIN
  IF TG_OP='DELETE' THEN v:=OLD.template_version_id; e:=OLD.experiment_id;
  ELSE v:=NEW.template_version_id; e:=NEW.experiment_id; END IF;
  IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW.template_version_id<>OLD.template_version_id OR NEW.experiment_id<>OLD.experiment_id) THEN
    RAISE EXCEPTION 'condition identity is immutable' USING ERRCODE='23514';
  END IF;
  SELECT status INTO s FROM research.template_version WHERE id=v AND experiment_id=e FOR UPDATE;
  IF s='published' THEN RAISE EXCEPTION 'published conditions are immutable' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER immutable_published_condition BEFORE INSERT OR UPDATE OR DELETE ON research.condition FOR EACH ROW EXECUTE FUNCTION research.guard_condition();
CREATE FUNCTION research.guard_condition_prompt() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c research.condition; p research.prompt_version; s text;
BEGIN
  IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'replace draft prompt mappings explicitly' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' THEN SELECT * INTO c FROM research.condition WHERE id=OLD.condition_id;
  ELSE SELECT * INTO c FROM research.condition WHERE id=NEW.condition_id; END IF;
  SELECT status INTO s FROM research.template_version WHERE id=c.template_version_id FOR UPDATE;
  IF s='published' THEN RAISE EXCEPTION 'published prompt mapping is immutable' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  SELECT * INTO p FROM research.prompt_version WHERE id=NEW.prompt_version_id;
  IF p.state_machine_version_id<>c.state_machine_version_id OR p.stage<>NEW.stage THEN
    RAISE EXCEPTION 'prompt does not match condition stage and machine' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER immutable_published_mapping BEFORE INSERT OR UPDATE OR DELETE ON research.condition_prompt FOR EACH ROW EXECUTE FUNCTION research.guard_condition_prompt();
