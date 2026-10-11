CREATE TABLE research.participant (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), experiment_id uuid NOT NULL REFERENCES research.experiment(id),
  participant_code text NOT NULL CHECK (length(btrim(participant_code)) BETWEEN 1 AND 80), password_hash text NOT NULL,
  status text NOT NULL DEFAULT 'enabled' CHECK(status IN ('enabled','disabled')), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(experiment_id,participant_code), UNIQUE(id,experiment_id)
);
CREATE TABLE research.experiment_assignment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), experiment_id uuid NOT NULL,
  participant_id uuid NOT NULL UNIQUE, template_version_id uuid NOT NULL, condition_id uuid NOT NULL,
  assigned_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(participant_id,experiment_id) REFERENCES research.participant(id,experiment_id),
  FOREIGN KEY(condition_id,template_version_id,experiment_id) REFERENCES research.condition(id,template_version_id,experiment_id),
  UNIQUE(id,experiment_id)
);
CREATE FUNCTION research.guard_assignment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s text;
BEGIN
  SELECT status INTO s FROM research.template_version WHERE id=NEW.template_version_id FOR UPDATE;
  IF s<>'published' THEN RAISE EXCEPTION 'assignment requires published configuration' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER published_assignment BEFORE INSERT ON research.experiment_assignment FOR EACH ROW EXECUTE FUNCTION research.guard_assignment();
CREATE TRIGGER immutable_assignment BEFORE UPDATE OR DELETE ON research.experiment_assignment FOR EACH ROW EXECUTE FUNCTION research.append_only();
CREATE TABLE research.experiment_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), assignment_id uuid NOT NULL UNIQUE, experiment_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','completed','withdrawn')), chat_revision integer NOT NULL DEFAULT 0 CHECK(chat_revision>=0),
  withdrawn_reason text, created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(assignment_id,experiment_id) REFERENCES research.experiment_assignment(id,experiment_id), UNIQUE(id,experiment_id)
);
CREATE FUNCTION research.guard_session_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id<>OLD.id OR NEW.assignment_id<>OLD.assignment_id OR NEW.experiment_id<>OLD.experiment_id THEN
    RAISE EXCEPTION 'session assignment is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER immutable_session_binding BEFORE UPDATE ON research.experiment_session FOR EACH ROW EXECUTE FUNCTION research.guard_session_identity();
CREATE TABLE research.experiment_state (
  session_id uuid PRIMARY KEY REFERENCES research.experiment_session(id), stage text NOT NULL, core_version integer NOT NULL CHECK(core_version>=0),
  snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (snapshot ?& ARRAY['stage','version','variables','receipts','experimentVersion','definitionSignature','path','lifecycle']),
  CHECK (jsonb_typeof(snapshot->'stage')='string' AND jsonb_typeof(snapshot->'version')='number' AND jsonb_typeof(snapshot->'path')='string' AND jsonb_typeof(snapshot->'lifecycle')='string' AND jsonb_typeof(snapshot->'definitionSignature')='string' AND jsonb_typeof(snapshot->'experimentVersion')='string'),
  CHECK ((snapshot->>'stage')=stage AND (snapshot->>'version')::integer=core_version),
  CHECK (jsonb_typeof(snapshot->'variables')='object' AND jsonb_typeof(snapshot->'receipts')='array')
);
CREATE TABLE research.conversation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL UNIQUE REFERENCES research.experiment_session(id),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,session_id)
);
CREATE TABLE research.conversation_turn (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL REFERENCES research.experiment_session(id),
  idempotency_key text NOT NULL, request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
  accepted_core_version integer NOT NULL CHECK(accepted_core_version>=0), chat_revision integer NOT NULL CHECK(chat_revision>0),
  status text NOT NULL CHECK(status IN ('pending','generating','ready','failed','cancelled','stale')),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(session_id,idempotency_key), UNIQUE(session_id,chat_revision), UNIQUE(id,session_id)
);
CREATE UNIQUE INDEX one_pending_turn ON research.conversation_turn(session_id) WHERE status IN ('pending','generating');
CREATE TABLE research.message (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL, conversation_id uuid NOT NULL, turn_id uuid NOT NULL,
  sequence integer NOT NULL CHECK(sequence>0), role text NOT NULL CHECK(role IN ('user','assistant')), content text,
  status text NOT NULL CHECK(status IN ('pending','ready','failed','cancelled','stale')), created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(conversation_id,session_id) REFERENCES research.conversation(id,session_id),
  FOREIGN KEY(turn_id,session_id) REFERENCES research.conversation_turn(id,session_id),
  CHECK(status<>'ready' OR content IS NOT NULL), UNIQUE(conversation_id,sequence), UNIQUE(turn_id,role)
);
CREATE TABLE research.state_transition (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL REFERENCES research.experiment_session(id),
  core_event_id text NOT NULL, event text NOT NULL, previous_state text NOT NULL, current_state text NOT NULL,
  from_version integer NOT NULL CHECK(from_version>=0), to_version integer NOT NULL,
  actor_type text NOT NULL CHECK(actor_type IN ('participant','backend')), actor_id text NOT NULL,
  validated_payload jsonb NOT NULL, receipt jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(to_version=from_version+1), UNIQUE(session_id,core_event_id), UNIQUE(session_id,to_version), UNIQUE(id,session_id)
);
CREATE TABLE research.experiment_variable (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL, key text NOT NULL, value jsonb NOT NULL,
  revision integer NOT NULL CHECK(revision>0), source_transition_id uuid NOT NULL, recorded_stage text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(jsonb_typeof(value) IN ('string','number','boolean')),
  FOREIGN KEY(source_transition_id,session_id) REFERENCES research.state_transition(id,session_id), UNIQUE(session_id,key,revision)
);
CREATE UNIQUE INDEX frozen_core_variables ON research.experiment_variable(session_id,key)
  WHERE key IN ('confirmed_viewpoint','viewpoint_confirmed','initial_rating','second_rating');
CREATE TRIGGER immutable_transition BEFORE UPDATE OR DELETE ON research.state_transition FOR EACH ROW EXECUTE FUNCTION research.append_only();
CREATE TRIGGER immutable_variable BEFORE UPDATE OR DELETE ON research.experiment_variable FOR EACH ROW EXECUTE FUNCTION research.append_only();
CREATE TABLE research.model_run_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), turn_id uuid NOT NULL, session_id uuid NOT NULL, experiment_id uuid NOT NULL,
  FOREIGN KEY(turn_id,session_id) REFERENCES research.conversation_turn(id,session_id),
  FOREIGN KEY(session_id,experiment_id) REFERENCES research.experiment_session(id,experiment_id),
  FOREIGN KEY(prompt_version_id,experiment_id) REFERENCES research.prompt_version(id,experiment_id),
  provider text NOT NULL, model_name text NOT NULL, prompt_version_id uuid NOT NULL REFERENCES research.prompt_version(id),
  prompt_version text NOT NULL, validator_version text NOT NULL, code_commit text NOT NULL,
  temperature numeric NOT NULL CHECK(temperature BETWEEN 0 AND 2), max_tokens integer NOT NULL CHECK(max_tokens BETWEEN 1 AND 32768),
  latency_ms numeric NOT NULL CHECK(latency_ms>=0), retry_count integer NOT NULL CHECK(retry_count BETWEEN 0 AND 2), fallback_count integer NOT NULL CHECK(fallback_count>=0),
  token_usage jsonb CHECK(token_usage IS NULL OR jsonb_typeof(token_usage)='object'),
  validator_result jsonb NOT NULL, error_code text, status text NOT NULL CHECK(status IN ('generated','fallback','blocked','failed','stale','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER immutable_model_log BEFORE UPDATE OR DELETE ON research.model_run_log FOR EACH ROW EXECUTE FUNCTION research.append_only();
CREATE TABLE research.admin_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), experiment_id uuid NOT NULL REFERENCES research.experiment(id),
  session_id uuid, actor_id text NOT NULL CHECK(length(btrim(actor_id))>0), event text NOT NULL,
  previous_state jsonb, reason text NOT NULL CHECK(length(btrim(reason))>0), created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(session_id,experiment_id) REFERENCES research.experiment_session(id,experiment_id)
);
CREATE TRIGGER immutable_admin_event BEFORE UPDATE OR DELETE ON research.admin_event FOR EACH ROW EXECUTE FUNCTION research.append_only();
-- Explicit participant projection: no stage, variable, credential or diagnostic data.
CREATE VIEW research.participant_message AS
  SELECT m.id,m.session_id,m.sequence,m.role,m.content,m.created_at FROM research.message m WHERE m.status='ready';
CREATE INDEX message_order ON research.message(session_id,sequence);
CREATE INDEX transition_history ON research.state_transition(session_id,created_at);
CREATE INDEX variable_history ON research.experiment_variable(session_id,key,revision DESC);
CREATE INDEX model_runs ON research.model_run_log(turn_id,created_at);
