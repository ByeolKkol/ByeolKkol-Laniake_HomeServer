/**
 * 공통 JSON fetch 유틸리티.
 * 각 API 모듈에서 baseUrl만 다르게 전달하여 사용.
 */
export function createRequest(getBaseUrl: () => string) {
  return async function request<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${getBaseUrl()}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`API error ${res.status}: ${body}`);
    }
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  };
}
