/** Shared API types. Clients cannot use these types to change server-side state. */
export type ExperimentPath = 'cognitive' | 'emotional' | 'daily';

/** Process health only; this does not indicate database or experiment readiness. */
export interface HealthResponse {
  status: 'ok';
  service: 'research-api';
  mode: 'scaffold';
}

/** Participant projection intentionally contains no internal stage or variables. */
export interface ParticipantFormField {
  name: string;
  kind: 'text' | 'number' | 'confirmation';
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
}
export interface ParticipantCurrent {
  study_path?: ExperimentPath;
  interaction?: 'chat';
  confirmation_card?: { belief: string };
  instructions: string;
  agent: { name: string; avatar?: string; identity?: string };
  state_token: string;
  status: 'awaiting_input' | 'generating' | 'finished';
  form: { id: string; fields: ParticipantFormField[] } | null;
  pending_turn_id?: string;
  rating_card?: { instruction: string; low_anchor: string; high_anchor: string; belief: string };
}
export interface ParticipantMessage {
  turn_id?: string | null;
  card_record?: { label: string; value: string | number | boolean; belief?: string } | null;
  id: string;
  role: 'user' | 'assistant';
  text: string;
  created_at: string;
}
export interface ParticipantTurn {
  turn_id: string;
  status: 'generating' | 'pending' | 'ready' | 'failed' | 'stale' | 'cancelled';
  text: string | null;
}
export interface AdminExperiment {
  id: string;
  name: string;
  version: number;
  status: string;
}
export interface AdminParticipant {
  id: string;
  participant_code: string;
  status: string;
  condition: string | null;
  session_id: string | null;
  stage: string | null;
  core_version: number | null;
}
export interface AdminMessage {
  id: string;
  session_id: string;
  sequence: number;
  role: string;
  content: string | null;
  status: string;
  created_at: string;
}

/** Internal read-only diagnostics; must never be consumed by participant routes. */
export interface AdminDevelopment {
  read_only: true;
  complete: false;
  states: Record<string, unknown>[];
  events: Record<string, unknown>[];
  variables: Record<string, unknown>[];
  model_runs: Record<string, unknown>[];
  debug_log: Record<string, unknown>[];
  event_log: Record<string, unknown>[];
  data_quality: { scope: string; passed: boolean; checks: Record<string, number> };
}
export {
  dailyIdentities,
  dailyTemporaryOpening,
  emotionalGuide,
  hanCount,
  questionCount,
  boundedBubbles,
  validGeneratedReply,
} from './chat-presentation.js';
