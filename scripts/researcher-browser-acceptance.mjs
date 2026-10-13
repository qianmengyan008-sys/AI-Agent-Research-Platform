/** Manual, paid-provider browser acceptance. Synthetic fixtures, never human review. */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';
const output = resolve(process.argv[2] ?? '/tmp/researcher-browser-acceptance');
const base = `http://127.0.0.1:${process.env.RESEARCHER_PREVIEW_PORT ?? '4173'}`;
const privateState = JSON.parse(
  await readFile('.researcher-preview-private/credentials.json', 'utf8'),
);
const accounts = privateState.rounds[process.env.RESEARCHER_ACCEPTANCE_ROUND ?? 'QA001'];
if (!accounts || accounts.length !== 3) throw new Error('CREATE_SEPARATE_QA_ROUND_FIRST');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_EXECUTABLE_PATH ?? '/usr/bin/chromium',
  headless: true,
});
const observations = [];
let status = 'incomplete';
async function records() {
  const res = await fetch(`${base}/api/admin/export?experiment_id=${privateState.experiment_id}`, {
    headers: { Authorization: `Bearer ${privateState.admin_token}` },
  });
  if (!res.ok) throw new Error('EXPORT_FAILED');
  return res.json();
}
const cognitive = [
  [
    'STEREOTYPE_CAPTURE',
    3,
    [
      '媒体让我觉得美国黑人的犯罪率高，但我还想到教育问题，不知道怎么说。',
      '这些印象来自新闻和短视频，我没有多少直接接触。',
      '我想先讨论媒体给我的犯罪率高这个印象。',
    ],
    { response: '媒体让我觉得美国黑人的犯罪率高。', source: '新闻和短视频' },
  ],
  [
    'VIEWPOINT_CONFIRMATION',
    1,
    ['我想确认媒体给我的犯罪率高这个印象。'],
    { viewpoint: '媒体让我觉得美国黑人的犯罪率高。', confirmed: true },
  ],
  ['INITIAL_RATING', 1, ['我准备给这个观点评分。'], { rating: 70 }],
  [
    'REFRAME_SOCIAL_STRUCTURE',
    3,
    [
      '也许社会环境和资源差异影响了情况。',
      '以前我忽视了教育与就业机会，可能还需要更多资料。',
      '我想把社会资源的差异也考虑进去。',
    ],
    { response: '我开始考虑社会资源差异。' },
  ],
  [
    'REFRAME_MEDIA_ALGORITHM',
    3,
    [
      '媒体可能选择了吸引注意的报道。',
      '短视频推荐让我连续看到相似内容，这不一定代表所有人。',
      '我愿意对照其他来源再判断。',
    ],
    { response: '我注意到算法和媒体选择。' },
  ],
  [
    'REFRAME_COUNTER_FACT',
    3,
    [
      '我也见过与原有印象不同的例子。',
      '我认识的一位同学认真可靠，新闻不能代表每个人。',
      '我愿意了解更多反例和文化差异。',
    ],
    { response: '我愿意了解反例。' },
  ],
  [
    'REFRAME_INDIVIDUAL_DIFFERENCE',
    3,
    [
      '每个人的经历不同，我不该一概而论。',
      '一个群体内部也有很多差异，我想多了解具体的人。',
      '我希望以后先看个人情况。',
    ],
    { response: '我开始关注美国黑人的个体差异。' },
  ],
  ['SECOND_RATING', 1, ['我想重新评价原先确认的观点。'], { rating: 45 }],
  [
    'ACTION_INTENTION',
    2,
    [
      '再看到关于美国黑人的刻板印象内容，我会先核实。',
      '我会对照来源，避免转发未经核实的群体评价。',
    ],
    { response: '我会核实美国黑人刻板印象相关内容。' },
  ],
];
const emotional = [
  [
    'PERSONA_SETUP',
    2,
    ['我希望Marcus喜欢音乐，李阳比较慢热。', '李阳会认真倾听，Marcus刚来到学校，希望结交朋友。'],
    { response: 'Marcus喜欢音乐，李阳性格慢热。' },
  ],
  [
    'FIRST_CONTACT',
    3,
    [
      '李阳在图书馆想问Marcus需要哪本书。',
      'Marcus在书架前有点犹豫，李阳决定先打招呼。',
      '他们交换名字，发现都在找同一本书。',
    ],
    { response: '他们在图书馆初次交流。' },
  ],
  [
    'MISUNDERSTANDING',
    2,
    [
      '食堂里Marcus以为李阳不想一起吃饭，其实李阳没听清。',
      '李阳回头想解释，Marcus却已经有点难过。',
    ],
    { response: '食堂里出现了一个小误会。' },
  ],
  [
    'RESOLUTION',
    2,
    ['李阳解释刚才没听清，并邀请Marcus一起吃饭。', 'Marcus听到解释松了口气，两个人继续交流。'],
    { response: '他们通过交流消除了误会。' },
  ],
  [
    'SHARED_EXPERIENCE',
    2,
    ['他们在自习室一起查资料，发现都喜欢音乐。', '李阳帮忙找文献，Marcus分享了喜欢的歌曲。'],
    { response: '两人发现共同兴趣。' },
  ],
  [
    'RELATIONSHIP',
    2,
    ['散步时他们分享初到陌生环境的感受。', '他们决定以后互相帮助，也愿意直接说出自己的困惑。'],
    { response: '他们逐渐成为朋友。' },
  ],
  ['ENDING_FEEDBACK', 1, ['这个故事让我觉得多交流才能避免误会。'], {}],
];
try {
  for (const account of accounts) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
    const turns = [];
    const observation = {
      path: account.path,
      participant_code: account.code,
      session_id: account.session_id,
      synthetic: true,
      scripted: true,
      human_review: 'pending',
      turns,
      started_at: new Date().toISOString(),
    };
    observations.push(observation);
    await page.goto(base);
    await page.getByLabel('实验编号', { exact: true }).fill(privateState.experiment_id);
    await page.getByLabel('参与者编号', { exact: true }).fill(account.code);
    await page.getByLabel('密码', { exact: true }).fill(account.password);
    await page.getByRole('button', { name: '登录实验', exact: true }).click();
    await expect(page.getByRole('heading', { name: '实验说明', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '开始／继续对话', exact: true }).click();
    const stages =
      account.path === 'cognitive_v1'
        ? cognitive
        : account.path === 'emotion_v1'
          ? emotional
          : [
              [
                'NATURAL_CHAT',
                2,
                ['今天我在公园散步，天气很好。', '周末我想读一本小说，聊聊你觉得有趣的故事吧。'],
                {},
              ],
            ];
    for (const [stage, count, messages, form] of stages) {
      let data = await records();
      let row = data.analysis_rows.find((r) => r.participant_id === account.participant_id);
      if (row.current_state.stage !== stage) throw new Error('UNEXPECTED_STAGE');
      for (let i = 0; i < count; i++) {
        const started = performance.now();
        await page.getByLabel('发送消息', { exact: true }).fill(messages[i]);
        const responsePromise = page.waitForResponse(
          (r) => r.url().endsWith('/api/conversation/message') && r.request().method() === 'POST',
          { timeout: 45000 },
        );
        await page.getByRole('button', { name: '发送', exact: true }).click();
        const response = await responsePromise;
        const turn = await response.json();
        turns.push({
          stage,
          turn_id: turn.turn_id,
          http_status: response.status(),
          status: turn.status,
          browser_roundtrip_ms: Math.round(performance.now() - started),
        });
        if (turn.status !== 'ready') throw new Error('GENERATION_NOT_READY');
        await expect(page.getByRole('button', { name: '刷新实验', exact: true })).toBeEnabled({
          timeout: 10000,
        });
        await expect(page.getByRole('log')).toContainText(messages[i]);
      }
      if (stage.includes('RATING')) {
        const card = page.getByRole('group', { name: '观点评分卡', exact: true });
        await expect(card).toContainText('媒体让我觉得美国黑人的犯罪率高。');
        await expect(page.getByLabel('当前评分', { exact: true })).toHaveAttribute('min', '0');
        await expect(page.getByLabel('当前评分', { exact: true })).toHaveAttribute('max', '100');
        await page.screenshot({
          path: resolve(output, `${account.path}-${stage}.png`),
          fullPage: true,
        });
      }
      data = await records();
      row = data.analysis_rows.find((r) => r.participant_id === account.participant_id);
      if (row.current_state.stage === stage && row.current_state.status !== 'completed') {
        for (const [key, value] of Object.entries(form)) {
          const label = {
            response: '当前回答',
            source: '表达来源（选填）',
            viewpoint: '确认后的观点',
            confirmed: '我确认上述观点',
            rating: '当前评分',
          }[key];
          if (typeof value === 'boolean') await page.getByLabel(label, { exact: true }).check();
          else await page.getByLabel(label, { exact: true }).fill(String(value));
        }
        const submission = page.waitForResponse(
          (r) => r.url().endsWith('/api/experiment/submissions') && r.request().method() === 'POST',
        );
        await page.getByRole('button', { name: '提交当前填写', exact: true }).click();
        if (!(await submission).ok()) throw new Error('SUBMISSION_FAILED');
        await expect(page.getByRole('button', { name: '刷新实验', exact: true })).toBeEnabled();
      }
    }
    await expect(page.getByText('本次实验已完成，谢谢参与。', { exact: true })).toBeVisible();
    await page.screenshot({
      path: resolve(output, `${account.path}-completed.png`),
      fullPage: true,
    });
    const body = await page.locator('body').innerText();
    if (
      /STEREOTYPE_CAPTURE|PERSONA_SETUP|NATURAL_CHAT|fallback|prompt_version|deepseek-flash|retry_count/.test(
        body,
      )
    )
      throw new Error('PARTICIPANT_DIAGNOSTICS_LEAKED');
    const data = await records();
    const row = data.analysis_rows.find((r) => r.participant_id === account.participant_id);
    observation.completed = row.current_state.status === 'completed';
    observation.final_state = row.current_state.stage;
    observation.ended_at = new Date().toISOString();
    if (!observation.completed || !data.complete || !data.data_quality.passed)
      throw new Error('INCOMPLETE_OR_INVALID_EXPORT');
    await page.close();
    console.info(`${account.path}: browser completed`);
  }
  const admin = await browser.newPage();
  await admin.goto(base);
  await admin.getByRole('button', { name: '管理员入口', exact: true }).click();
  await admin.getByLabel('管理员访问凭据', { exact: true }).fill(privateState.admin_token);
  await admin.getByRole('button', { name: '进入后台', exact: true }).click();
  await admin.getByLabel('选择实验', { exact: true }).selectOption(privateState.experiment_id);
  const downloadPromise = admin.waitForEvent('download');
  await admin.getByRole('button', { name: '下载完整 JSON', exact: true }).click();
  const download = await downloadPromise;
  await download.saveAs(resolve(output, 'browser-full-export.json'));
  const exported = JSON.parse(await readFile(resolve(output, 'browser-full-export.json'), 'utf8'));
  if (
    !exported.complete ||
    exported.per_table_limit !== null ||
    exported.analysis_rows.length !== 6
  )
    throw new Error('BROWSER_EXPORT_INCOMPLETE');
  await admin.getByLabel('开发模式（仅管理员）', { exact: true }).check();
  await expect(admin.getByLabel('管理员开发数据', { exact: true })).toBeVisible();
  // Clear masked admin input before taking a screenshot.
  await admin.screenshot({
    path: resolve(output, 'admin-read-only-diagnostics.png'),
    fullPage: true,
  });
  await admin.close();
  status = 'completed';
} catch (error) {
  status =
    error instanceof Error && /^[A-Z_]+$/.test(error.message)
      ? error.message
      : 'BROWSER_ACCEPTANCE_FAILED';
  process.exitCode = 1;
} finally {
  await browser.close();
  await writeFile(
    resolve(output, 'browser-acceptance.json'),
    JSON.stringify(
      {
        status,
        real_model: true,
        synthetic: true,
        scripted: true,
        human_experience_completed: false,
        mentor_test_ready: false,
        observations,
      },
      null,
      2,
    ) + '\n',
  );
  await writeFile(
    resolve(output, 'complete-export.json'),
    JSON.stringify(await records(), null, 2) + '\n',
  );
  console.info(`browser acceptance: ${status}`);
}
