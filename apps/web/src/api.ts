export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}
export async function api<T>(
  path: string,
  token = '',
  body?: unknown,
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 30000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000)
    throw new Error('Invalid client request deadline');
  if (options.signal?.aborted) throw new ApiError(0, 'REQUEST_CANCELLED');
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel: () => void = () => {};
  let cancellationCode = 'NETWORK_ERROR';
  const deadline = new Promise<never>((_resolve, reject) => {
    const stop = (code: string) => {
      cancellationCode = code;
      reject(new ApiError(0, code));
      controller.abort();
    };
    cancel = () => stop('REQUEST_CANCELLED');
    timer = setTimeout(() => stop('REQUEST_TIMEOUT'), timeoutMs);
    options.signal?.addEventListener('abort', cancel, { once: true });
    if (options.signal?.aborted) cancel();
  });
  async function operation(): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`/api${path}`, {
        signal: controller.signal,
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new ApiError(0, cancellationCode);
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new ApiError(
        response.status,
        typeof payload.error === 'string' ? payload.error : 'REQUEST_FAILED',
      );
    }
    return response.json() as Promise<T>;
  }
  try {
    return await Promise.race([operation(), deadline]);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', cancel);
  }
}
export function errorText(error: unknown) {
  if (error instanceof ApiError) {
    if (error.code === 'REQUEST_TIMEOUT')
      return '请求等待超时。结果可能已保存，请刷新查看；重试将沿用同一操作编号。';
    if (error.code === 'REQUEST_CANCELLED') return '请求已停止，可以刷新查看已保存结果。';
    if (error.status === 401) return '登录信息无效或已过期，请重新登录。';
    if (error.code === 'MINIMUM_TURNS_REQUIRED')
      return '当前有效互动尚未达到规定次数，请先继续对话。';
    if (error.code === 'MAXIMUM_TURNS_REACHED')
      return '当前开放对话已达上限，请提交必填信息或联系研究人员。';
    if (error.code === 'RESEARCHER_REQUIRED')
      return '当前无法取得所需信息，请联系研究人员；不会自动填写评分或确认观点。';
    if (error.code === 'NON_STORY_INPUT')
      return '流程询问或误输入不能作为故事填写，请补充人物或故事内容。';
    if (error.code === 'INVALID_RATING') return '评分须为0到100之间的整数。';
    if (error.code === 'FIXED_BOOTSTRAP_ACCOUNT')
      return '此固定账号请从内部账号领取页获取密码；不会更改其初始化种子。';
    if (error.code === 'ASSIGNMENT_OPTIONS_MISMATCH')
      return '请选择当前实验中已经发布的路径和组别。';
    if (error.status === 409) return '当前操作发生冲突，请刷新实验后继续。';
    if (error.code === 'NOT_ASSIGNED') return '账号尚未分配实验，请联系研究人员。';
    if (error.status === 400) return '填写内容不符合当前要求，请检查后重试。';
    if (error.status === 429) return '登录尝试过多，请稍后再试。';
    if (error.status === 0) return '网络连接中断，请检查连接后重试。';
  }
  return '暂时无法完成操作，请稍后重试或联系研究人员。';
}
