import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
export class ServiceError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}
export const fail = (status: number, code: string): never => {
  throw new ServiceError(status, code);
};
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical((value as Record<string, unknown>)[key])]),
    );
  return value;
}
export const hash = (value: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
export function text(value: unknown, max = 10000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail(400, 'INVALID_INPUT');
  return value as string;
}
export function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((k) => !keys.includes(k))
  )
    fail(400, 'INVALID_INPUT');
  return value as Record<string, unknown>;
}
export function uuid(value: unknown): string {
  const v = text(value, 36);
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v))
    fail(400, 'INVALID_INPUT');
  return v;
}
export function passwordHash(password: string) {
  text(password, 256);
  if (password.length < 12) fail(400, 'PASSWORD_TOO_SHORT');
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function verifyPassword(password: string, encoded: string) {
  if (!/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(encoded)) return false;
  const [salt, key] = encoded.split(':');
  return timingSafeEqual(scryptSync(password, salt!, 64), Buffer.from(key!, 'hex'));
}
export interface ParticipantIdentity {
  readonly participantId: string;
}
export interface AdminIdentity {
  readonly id: string;
  readonly role: 'admin';
}
export function admin(actor: AdminIdentity) {
  if (actor?.role !== 'admin') fail(403, 'FORBIDDEN');
}
