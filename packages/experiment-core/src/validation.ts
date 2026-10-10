import { EventType } from './events.js';
import type { ExperimentEvent } from './events.js';
import type { ExperimentDefinition, Scalar, StageDefinition } from './types.js';

const unsafeNames = new Set(['__proto__', 'prototype', 'constructor']);
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const isName = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && !unsafeNames.has(value);
const knownEvent = (value: unknown): value is EventType =>
  typeof value === 'string' && Object.values(EventType).includes(value as EventType);
export const isVersion = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
export function isEvent(value: unknown): value is ExperimentEvent {
  return (
    isRecord(value) &&
    Object.keys(value).every((key) =>
      ['id', 'type', 'experimentVersion', 'expectedStateVersion'].includes(key),
    ) &&
    isName(value.id) &&
    knownEvent(value.type) &&
    isName(value.experimentVersion) &&
    isVersion(value.expectedStateVersion)
  );
}

/** Validate configuration without callbacks, code evaluation, or external services. */
export function validateDefinition(value: unknown): readonly string[] {
  if (!isRecord(value)) return ['Definition must be a plain object'];
  if (
    typeof value.path !== 'string' ||
    !['cognitive', 'emotional', 'daily'].includes(value.path) ||
    !isName(value.experimentVersion)
  ) {
    return ['Definition needs a supported path and nonempty experimentVersion'];
  }
  if (Object.keys(value).some((key) => !['path', 'experimentVersion', 'stages'].includes(key)))
    return ['Definition contains unsupported fields'];
  if (!Array.isArray(value.stages) || value.stages.length < 2)
    return ['Definition needs initial and final stages'];
  const ids = new Set<string>();
  const variables = new Set<string>();
  for (const [index, stage] of value.stages.entries()) {
    if (!isRecord(stage) || !isName(stage.id) || ids.has(stage.id) || !Array.isArray(stage.fields))
      return ['Stages need unique IDs and a field-rule array'];
    if (Object.keys(stage).some((key) => !['id', 'on', 'fields'].includes(key)))
      return ['Stage contains unsupported fields'];
    ids.add(stage.id);
    const final = index === value.stages.length - 1;
    if (final ? stage.on !== undefined || stage.fields.length !== 0 : !knownEvent(stage.on))
      return ['Only the final stage is terminal; other stages require a known event'];
    const fields = new Set<string>();
    for (const field of stage.fields) {
      if (
        !isRecord(field) ||
        !isName(field.field) ||
        !isName(field.variable) ||
        fields.has(field.field) ||
        variables.has(field.variable)
      )
        return [
          'Fields and variable names must be safe and unique; variables cannot be overwritten',
        ];
      fields.add(field.field);
      variables.add(field.variable);
      const options =
        field.type === 'text'
          ? ['maxLength']
          : field.type === 'number'
            ? ['min', 'max']
            : field.type === 'confirmation'
              ? []
              : null;
      if (
        !options ||
        Object.keys(field).some((key) => !['field', 'variable', 'type', ...options].includes(key))
      )
        return ['Unsupported field rule'];
      if (
        field.type === 'text' &&
        field.maxLength !== undefined &&
        (typeof field.maxLength !== 'number' ||
          !Number.isSafeInteger(field.maxLength) ||
          field.maxLength < 1)
      )
        return ['Invalid text maximum'];
      if (field.type === 'number') {
        for (const key of ['min', 'max'])
          if (
            field[key] !== undefined &&
            (typeof field[key] !== 'number' || !Number.isFinite(field[key]))
          )
            return ['Invalid rating bound'];
        if (typeof field.min === 'number' && typeof field.max === 'number' && field.min > field.max)
          return ['Rating minimum exceeds maximum'];
      }
    }
  }
  return [];
}

/** Canonical structural JSON, not a cryptographic checksum or authenticity proof. */
export function signature(definition: ExperimentDefinition): string {
  return JSON.stringify({
    path: definition.path,
    experimentVersion: definition.experimentVersion,
    stages: definition.stages.map((stage) => ({
      id: stage.id,
      on: stage.on ?? null,
      fields: stage.fields
        .map((rule) => ({
          field: rule.field,
          variable: rule.variable,
          type: rule.type,
          ...(rule.type === 'text' ? { maxLength: rule.maxLength ?? null } : {}),
          ...(rule.type === 'number' ? { min: rule.min ?? null, max: rule.max ?? null } : {}),
        }))
        .sort((a, b) => (a.field < b.field ? -1 : a.field > b.field ? 1 : 0)),
    })),
  });
}
export function dataErrors(data: unknown, stage: StageDefinition): readonly string[] {
  if (!isRecord(data)) return ['Data must be a plain object'];
  if (
    Object.keys(data).length !== stage.fields.length ||
    Object.keys(data).some((key) => !stage.fields.some((rule) => rule.field === key))
  )
    return ['Missing or unexpected data fields'];
  for (const rule of stage.fields) {
    const value = data[rule.field];
    if (
      rule.type === 'text' &&
      (typeof value !== 'string' ||
        value.trim().length === 0 ||
        (rule.maxLength !== undefined && value.length > rule.maxLength))
    )
      return [`Invalid text: ${rule.field}`];
    if (rule.type === 'confirmation' && value !== true)
      return [`Explicit confirmation required: ${rule.field}`];
    if (
      rule.type === 'number' &&
      (typeof value !== 'number' ||
        !Number.isFinite(value) ||
        (rule.min !== undefined && value < rule.min) ||
        (rule.max !== undefined && value > rule.max))
    )
      return [`Invalid rating: ${rule.field}`];
  }
  return [];
}
export function sameData(a: unknown, b: unknown): boolean {
  return (
    isRecord(a) &&
    isRecord(b) &&
    Object.keys(a).length === Object.keys(b).length &&
    Object.keys(a).every((key) => Object.hasOwn(b, key) && a[key] === b[key])
  );
}
export function copyData(data: unknown): Record<string, Scalar> {
  // Call only after dataErrors has validated every value as a scalar.
  return { ...(data as Record<string, Scalar>) };
}
