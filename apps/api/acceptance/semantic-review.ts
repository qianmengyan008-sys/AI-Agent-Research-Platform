import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createSemanticReview, semanticReviewMarkdown } from '../src/acceptance/semantic-review.js';
try {
  const [inputPath, prefix, flag, ...extra] = process.argv.slice(2);
  if (!inputPath || !prefix || extra.length || (flag && flag !== '--fixture'))
    throw new Error('Invalid arguments');
  const input: unknown = JSON.parse(await readFile(inputPath, 'utf8'));
  const source = flag === '--fixture' ? ((input as { data?: unknown }).data ?? input) : input;
  const review = createSemanticReview(
    source,
    flag === '--fixture' ? 'local-fixture' : 'real-provider',
  );
  const paths = [`${prefix}.json`, `${prefix}.md`];
  for (const path of paths) {
    let exists = false;
    try {
      await access(path);
      exists = true;
    } catch {
      /* Absent output is expected. */
    }
    if (exists) throw new Error('Review output already exists');
  }
  await mkdir(dirname(prefix), { recursive: true });
  await writeFile(paths[0]!, JSON.stringify(review, null, 2) + '\n', { flag: 'wx' });
  await writeFile(paths[1]!, semanticReviewMarkdown(review), { flag: 'wx' });
  console.info(
    JSON.stringify({
      scope: review.scope,
      rows: review.row_count,
      semantic_review: review.semantic_review,
      pilot_ready: false,
    }),
  );
} catch {
  console.error(
    '审核材料未生成：检查输入范围、追踪完整性、输出路径及是否已有文件。错误详情不输出原始内容。',
  );
  process.exitCode = 1;
}
