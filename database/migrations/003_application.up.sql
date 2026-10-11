ALTER TABLE research.experiment_state ADD COLUMN state_token uuid NOT NULL DEFAULT gen_random_uuid();
CREATE TABLE research.auth_session (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), participant_id uuid NOT NULL REFERENCES research.participant(id),
 token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[a-f0-9]{64}$'), expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_expiration ON research.auth_session(expires_at);
CREATE TABLE research.submission_receipt (
 session_id uuid NOT NULL REFERENCES research.experiment_session(id), request_id text NOT NULL,
 request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'), response jsonb NOT NULL,
 PRIMARY KEY(session_id,request_id)
);
ALTER TABLE research.conversation_turn ADD COLUMN lease_until timestamptz;
ALTER TABLE research.conversation_turn ADD COLUMN lease_token uuid;
CREATE INDEX turn_recovery ON research.conversation_turn(status,lease_until);

ALTER TABLE research.conversation_turn ADD COLUMN generation_context jsonb NOT NULL DEFAULT '{}';

-- Step 6.1 had no owning worker or lease. Do not leave legacy pending turns blocking a session.
UPDATE research.conversation_turn SET status='failed' WHERE status IN ('pending','generating');
UPDATE research.message m SET status='failed' FROM research.conversation_turn t
  WHERE m.turn_id=t.id AND t.status='failed' AND m.role='assistant' AND m.status='pending';
UPDATE research.experiment_session s SET chat_revision=GREATEST(s.chat_revision,
  COALESCE((SELECT MAX(t.chat_revision) FROM research.conversation_turn t WHERE t.session_id=s.id),0));
