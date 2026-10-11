export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}
export async function api<T>(path: string, token = '', body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR');
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
export function errorText(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401) return '登录信息无效或已过期，请重新登录。';
    if (error.status === 409) return '当前操作发生冲突，请刷新实验后继续。';
    if (error.code === 'NOT_ASSIGNED') return '账号尚未分配实验，请联系研究人员。';
    if (error.status === 400) return '填写内容不符合当前要求，请检查后重试。';
    if (error.status === 429) return '登录尝试过多，请稍后再试。';
    if (error.status === 0) return '网络连接中断，请检查连接后重试。';
  }
  return '暂时无法完成操作，请稍后重试或联系研究人员。';
}
