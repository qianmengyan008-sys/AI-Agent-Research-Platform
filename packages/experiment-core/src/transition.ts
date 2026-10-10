import { freeze } from './immutable.js';
import {
  copyData,
  dataErrors,
  isEvent,
  isRecord,
  isVersion,
  sameData,
  signature,
  validateDefinition,
} from './validation.js';
import type {
  ExperimentDefinition,
  ExperimentStateSnapshot,
  Scalar,
  TransitionErrorCode,
  TransitionResult,
} from './types.js';

export function createInitialState(definition: ExperimentDefinition): ExperimentStateSnapshot {
  const errors = validateDefinition(definition);
  if (errors.length) throw new Error(errors.join('; '));
  return freeze({
    path: definition.path,
    experimentVersion: definition.experimentVersion,
    definitionSignature: signature(definition),
    stage: definition.stages[0]!.id,
    lifecycle: 'assigned',
    version: 0,
    variables: {},
    receipts: [],
  });
}

/** Replay receipts to verify a JSON-restored snapshot has a coherent history. */
function validState(state: ExperimentStateSnapshot, definition: ExperimentDefinition): boolean {
  if (
    !isRecord(state) ||
    !isVersion(state.version) ||
    state.version >= definition.stages.length ||
    !Array.isArray(state.receipts) ||
    state.receipts.length !== state.version ||
    !isRecord(state.variables)
  )
    return false;
  const stage = definition.stages[state.version]!;
  const lifecycle =
    state.version === 0
      ? 'assigned'
      : state.version === definition.stages.length - 1
        ? 'completed'
        : 'active';
  if (state.stage !== stage.id || state.lifecycle !== lifecycle) return false;
  const ids = new Set<string>();
  const variables: Record<string, Scalar> = {};
  for (const [index, receipt] of state.receipts.entries()) {
    if (!isRecord(receipt)) return false;
    const { data, ...event } = receipt;
    if (
      !isEvent(event) ||
      ids.has(event.id) ||
      event.experimentVersion !== definition.experimentVersion ||
      event.expectedStateVersion !== index
    )
      return false;
    const source = definition.stages[index]!;
    if (event.type !== source.on || dataErrors(data, source).length) return false;
    ids.add(event.id);
    const receiptData = copyData(data);
    for (const rule of source.fields) variables[rule.variable] = receiptData[rule.field]!;
  }
  return sameData(variables, state.variables);
}

/** Pure deterministic transition: no time, random IDs, database, HTTP, or model access. */
export function transition(
  currentState: ExperimentStateSnapshot,
  event: unknown,
  validatedData: unknown,
  experimentDefinition: ExperimentDefinition,
): TransitionResult {
  const reject = (code: TransitionErrorCode, message: string): TransitionResult => ({
    ok: false,
    newState: currentState,
    events: [],
    variables: [],
    errors: [{ code, message }],
  });
  const invalidDefinition = validateDefinition(experimentDefinition);
  if (invalidDefinition.length) return reject('INVALID_DEFINITION', invalidDefinition.join('; '));
  if (!isRecord(currentState)) return reject('INVALID_STATE', 'State must be a snapshot');
  if (currentState.path !== experimentDefinition.path)
    return reject('PATH_MISMATCH', 'Definition belongs to another path');
  if (currentState.experimentVersion !== experimentDefinition.experimentVersion)
    return reject(
      'EXPERIMENT_VERSION_MISMATCH',
      'Session is pinned to its original experiment version',
    );
  if (currentState.definitionSignature !== signature(experimentDefinition))
    return reject('DEFINITION_MISMATCH', 'A pinned definition cannot be edited in place');
  if (!validState(currentState, experimentDefinition))
    return reject(
      'INVALID_STATE',
      'Snapshot does not match its stage, version, variables and event history',
    );
  if (!isEvent(event))
    return reject(
      'INVALID_EVENT',
      'Expected a known event with ID and versions; target stages are not accepted',
    );
  if (event.experimentVersion !== currentState.experimentVersion)
    return reject('EXPERIMENT_VERSION_MISMATCH', 'Event belongs to another experiment version');
  const previous = currentState.receipts.find((receipt) => receipt.id === event.id);
  if (previous) {
    const duplicate =
      previous.type === event.type &&
      previous.expectedStateVersion === event.expectedStateVersion &&
      sameData(previous.data, validatedData);
    return reject(
      duplicate ? 'DUPLICATE_EVENT' : 'EVENT_ID_CONFLICT',
      duplicate ? 'Event was already applied' : 'Event ID was reused with different content',
    );
  }
  if (event.expectedStateVersion !== currentState.version)
    return reject('STATE_VERSION_CONFLICT', 'Refresh the snapshot before submitting another event');
  if (currentState.lifecycle === 'completed')
    return reject('TERMINAL_STATE', 'Completed sessions cannot advance');
  const source = experimentDefinition.stages[currentState.version]!;
  const target = experimentDefinition.stages[currentState.version + 1]!;
  if (event.type !== source.on)
    return reject('EVENT_NOT_ALLOWED', 'Event is not allowed in the current stage');
  const invalidData = dataErrors(validatedData, source);
  if (invalidData.length) return reject('INVALID_DATA', invalidData.join('; '));
  const data = copyData(validatedData);
  const variables = source.fields.map((rule) => ({
    key: rule.variable,
    value: data[rule.field]!,
    stage: source.id,
    sourceEventId: event.id,
    experimentVersion: currentState.experimentVersion,
  }));
  const variableValues = { ...currentState.variables };
  for (const variable of variables) variableValues[variable.key] = variable.value;
  const newState: ExperimentStateSnapshot = {
    ...currentState,
    stage: target.id,
    lifecycle:
      currentState.version + 1 === experimentDefinition.stages.length - 1 ? 'completed' : 'active',
    version: currentState.version + 1,
    variables: variableValues,
    receipts: [
      ...currentState.receipts.map((receipt) => ({ ...receipt, data: { ...receipt.data } })),
      { ...event, data },
    ],
  };
  return freeze({
    ok: true,
    newState,
    events: [
      {
        eventId: event.id,
        type: event.type,
        experimentVersion: currentState.experimentVersion,
        fromStage: source.id,
        toStage: target.id,
        fromVersion: currentState.version,
        toVersion: newState.version,
      },
    ],
    variables,
    errors: [],
  });
}
