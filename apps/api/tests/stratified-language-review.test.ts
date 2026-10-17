import { test, expect } from 'vitest';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { buildStratifiedReview } from '../../../scripts/stratified-language-review.mjs';
test('40 real samples retain all retries/fallbacks/anomalies, human blanks and contextual history deterministically', async () => {
  const source = resolve(import.meta.dirname, '../../../docs/acceptance/step6-round32');
  const before = await readFile(resolve(source, 'human-language-review-template.json'), 'utf8');
  const a = await buildStratifiedReview(source),
    b = await buildStratifiedReview(source);
  expect(a).toEqual(b);
  expect(a.selected_count).toBe(40);
  expect(a.mandatory_count).toBe(27);
  expect(a.all_retry_fallback_and_anomaly_rows_included).toBe(true);
  for (const code of [
    'BELIEF_ANCHOR_MISSING',
    'BELIEF_REPLACEMENT',
    'BACKEND_DISCLOSURE',
    'WRONG_SCENE',
    'EMPTY_REPLY',
  ])
    expect(a.violation_coverage[code]).toBeGreaterThan(0);
  expect(a.items.some((x) => x.previous_three_turns.length === 3)).toBe(true);
  expect(
    a.items.every(
      (x) =>
        Object.values(x.scores).every((s) => s === null) &&
        x.willing_to_continue === null &&
        x.obvious_scripted_feel === null,
    ),
  ).toBe(true);
  expect(a.human_average).toBeNull();
  expect(a.human_scored_items).toBe(0);
  expect(await readFile(resolve(source, 'human-language-review-template.json'), 'utf8')).toBe(
    before,
  );
});
