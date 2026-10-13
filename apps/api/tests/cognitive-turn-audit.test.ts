import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { test, expect } from 'vitest';
const root = resolve(import.meta.dirname, '../../..');
const source = resolve(root, 'docs/acceptance/step6-round26/complete-export.json');
const digest = (s: string) => createHash('sha256').update(s).digest('hex');

test('historical cognitive audit preserves provenance, missing candidates and generation-linked state changes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cognitive-review-'));
  const original = await readFile(source, 'utf8');
  const run = spawnSync(
    process.execPath,
    ['scripts/cognitive-turn-audit.mjs', source, join(directory, 'valid')],
    { cwd: root, encoding: 'utf8' },
  );
  expect(run.status, run.stderr).toBe(0);
  const report = JSON.parse(
    await readFile(join(directory, 'valid/cognitive-turn-audit.json'), 'utf8'),
  );
  expect(report.total_turns).toBe(20);
  expect(report.retry_count).toBe(9);
  expect(report.fallback_turns).toBe(8);
  expect(report.raw_candidates_available).toBe(false);
  expect(report.mentor_test_ready).toBe(false);
  expect(report.rejection_reason_counts).toEqual({ BELIEF_ANCHOR_MISSING: 3, EMPTY_REPLY: 14 });
  expect(
    report.items.every((t: { raw_model_candidates: null }) => t.raw_model_candidates === null),
  ).toBe(true);
  const automatic = report.items.filter(
    (t: { automatic_transition: unknown }) => t.automatic_transition,
  );
  expect(automatic).toHaveLength(4);
  for (const turn of automatic) {
    expect(turn.automatic_transition.validated_payload.source_turn_id).toBe(turn.turn_id);
    expect(turn.state_after_generation.core_version).toBe(turn.state_before.core_version + 1);
  }
  const overwrite = spawnSync(
    process.execPath,
    ['scripts/cognitive-turn-audit.mjs', source, join(directory, 'valid')],
    { cwd: root },
  );
  expect(overwrite.status).not.toBe(0);
  expect(digest(await readFile(source, 'utf8'))).toBe(digest(original));
  const corrupt = JSON.parse(original);
  const row = corrupt.analysis_rows.find(
    (r: { path_type: string; current_state: { status: string } }) =>
      r.path_type === 'cognitive' && r.current_state.status === 'completed',
  );
  row.conversation_history[1].role = 'user';
  await writeFile(join(directory, 'ambiguous.json'), JSON.stringify(corrupt));
  const ambiguous = spawnSync(
    process.execPath,
    [
      'scripts/cognitive-turn-audit.mjs',
      join(directory, 'ambiguous.json'),
      join(directory, 'ambiguous'),
    ],
    { cwd: root, encoding: 'utf8' },
  );
  expect(ambiguous.status).not.toBe(0);
  expect(ambiguous.stderr).toContain('AMBIGUOUS_MESSAGE_TURN_PAIRING');
});
