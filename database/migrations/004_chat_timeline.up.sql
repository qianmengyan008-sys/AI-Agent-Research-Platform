-- Additive only: no updates/deletes of accounts, states, messages or study material.
CREATE TABLE research.chat_notice (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 session_id uuid NOT NULL REFERENCES research.experiment_session(id),
 notice_key text NOT NULL,
 after_sequence integer NOT NULL CHECK(after_sequence>=0),
 notice_order integer NOT NULL,
 content text NOT NULL,
 card_record jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(session_id,notice_key)
);
CREATE INDEX chat_notice_session_order ON research.chat_notice(session_id,after_sequence,notice_order);
CREATE TRIGGER immutable_chat_notice BEFORE UPDATE OR DELETE ON research.chat_notice
FOR EACH ROW EXECUTE FUNCTION research.append_only();
