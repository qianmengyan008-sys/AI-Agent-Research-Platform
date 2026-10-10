import type { ExperimentPath } from '@research/contracts';
import type { EventType, ExperimentEvent } from './events.js';

export type Scalar = string | number | boolean;
export type FieldRule = {
  readonly field: string;
  readonly variable: string;
} & (
  | { readonly type: 'text'; readonly maxLength?: number }
  | { readonly type: 'number'; readonly min?: number; readonly max?: number }
  | { readonly type: 'confirmation' }
);

/** All stages except the final stage declare exactly one advancement rule. */
export interface StageDefinition {
  readonly id: string;
  readonly on?: EventType;
  readonly fields: readonly FieldRule[];
}
export interface ExperimentDefinition {
  readonly path: ExperimentPath;
  readonly experimentVersion: string;
  readonly stages: readonly StageDefinition[];
}
export interface EventReceipt extends ExperimentEvent {
  readonly data: Readonly<Record<string, Scalar>>;
}

/** JSON-serializable snapshot; future persistence must save it atomically. */
export interface ExperimentStateSnapshot {
  readonly path: ExperimentPath;
  readonly experimentVersion: string;
  readonly definitionSignature: string;
  readonly stage: string;
  readonly lifecycle: 'assigned' | 'active' | 'completed';
  readonly version: number;
  readonly variables: Readonly<Record<string, Scalar>>;
  readonly receipts: readonly EventReceipt[];
}
export type TransitionErrorCode =
  | 'INVALID_DEFINITION'
  | 'INVALID_STATE'
  | 'INVALID_EVENT'
  | 'INVALID_DATA'
  | 'PATH_MISMATCH'
  | 'EXPERIMENT_VERSION_MISMATCH'
  | 'DEFINITION_MISMATCH'
  | 'STATE_VERSION_CONFLICT'
  | 'DUPLICATE_EVENT'
  | 'EVENT_ID_CONFLICT'
  | 'EVENT_NOT_ALLOWED'
  | 'TERMINAL_STATE';
export interface TransitionError {
  readonly code: TransitionErrorCode;
  readonly message: string;
}
export interface StateTransitionEvent {
  readonly eventId: string;
  readonly type: EventType;
  readonly experimentVersion: string;
  readonly fromStage: string;
  readonly toStage: string;
  readonly fromVersion: number;
  readonly toVersion: number;
}
export interface VariableChange {
  readonly key: string;
  readonly value: Scalar;
  readonly stage: string;
  readonly sourceEventId: string;
  readonly experimentVersion: string;
}
export interface TransitionResult {
  readonly ok: boolean;
  readonly newState: ExperimentStateSnapshot;
  readonly events: readonly StateTransitionEvent[];
  readonly variables: readonly VariableChange[];
  readonly errors: readonly TransitionError[];
}
