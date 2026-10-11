-- Destructive development rollback; this deletes runtime research data.
DROP VIEW research.participant_message;
DROP TABLE research.admin_event, research.model_run_log, research.experiment_variable, research.state_transition,
  research.message, research.conversation_turn, research.conversation, research.experiment_state,
  research.experiment_session, research.experiment_assignment, research.participant;
DROP FUNCTION research.guard_assignment(), research.guard_session_identity();
