DROP INDEX research.turn_recovery;
ALTER TABLE research.conversation_turn DROP COLUMN lease_until, DROP COLUMN lease_token, DROP COLUMN generation_context;
DROP TABLE research.submission_receipt, research.auth_session;
ALTER TABLE research.experiment_state DROP COLUMN state_token;
