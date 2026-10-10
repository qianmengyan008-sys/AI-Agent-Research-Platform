/** Domain events supplied by the trusted backend, never by a model response. */
export enum EventType {
  EXPERIMENT_STARTED = 'EXPERIMENT_STARTED',
  STEREOTYPE_SUBMITTED = 'STEREOTYPE_SUBMITTED',
  VIEWPOINT_CONFIRMED = 'VIEWPOINT_CONFIRMED',
  RATING_SUBMITTED = 'RATING_SUBMITTED',
  REFRAME_COMPLETED = 'REFRAME_COMPLETED',
  ACTION_INTENTION_SUBMITTED = 'ACTION_INTENTION_SUBMITTED',
  STAGE_RESPONSE_SUBMITTED = 'STAGE_RESPONSE_SUBMITTED',
  CHAT_FINISHED = 'CHAT_FINISHED',
}

export interface ExperimentEvent {
  readonly id: string;
  readonly type: EventType;
  readonly experimentVersion: string;
  readonly expectedStateVersion: number;
}
