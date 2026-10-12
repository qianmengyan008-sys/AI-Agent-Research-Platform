import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { runDeepSeekFlashSmoke } from './deepseek-flash-smoke.js';
const output = process.argv[2];
if (!output || process.argv.length !== 3) {
  console.error('需要一个新的报告文件路径。');
  process.exitCode = 1;
} else {
  const report = await runDeepSeekFlashSmoke(process.env);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.info(
    JSON.stringify({
      status: report.status,
      provider: report.provider,
      adapter_attempts: report.adapter_attempts,
      pilot_ready: false,
    }),
  );
  process.exitCode = report.status === 'not_run' ? 2 : report.status === 'failed' ? 1 : 0;
}
