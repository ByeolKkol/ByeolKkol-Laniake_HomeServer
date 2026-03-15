import { getWolApiBase } from './settingsStore';

export type OsType = 'windows' | 'linux';

export interface WolTarget {
  id: string;
  name: string;
  mac: string;
  ip: string | null;
  ssh_port: number;
  ssh_user: string | null;
  ssh_password: string | null;
  os_type: OsType;
}

export interface WolTargetCreate {
  name: string;
  mac: string;
  ip?: string;
  ssh_port?: number;
  ssh_user?: string;
  ssh_password?: string;
  os_type?: OsType;
}

export interface PowerStatus {
  id: string;
  online: boolean | null;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${getWolApiBase()}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`WOL API error ${res.status}: ${body}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const fetchTargets = (): Promise<WolTarget[]> =>
  request<WolTarget[]>('/targets');

export const createTarget = (body: WolTargetCreate): Promise<WolTarget> =>
  request<WolTarget>('/targets', { method: 'POST', body: JSON.stringify(body) });

export const updateTarget = (id: string, body: Partial<WolTargetCreate>): Promise<WolTarget> =>
  request<WolTarget>(`/targets/${id}`, { method: 'PATCH', body: JSON.stringify(body) });

export const deleteTarget = (id: string): Promise<void> =>
  request<void>(`/targets/${id}`, { method: 'DELETE' });

export const wakeTarget = (id: string): Promise<void> =>
  request<void>(`/power/wake/${id}`, { method: 'POST' });

export const shutdownTarget = (id: string): Promise<void> =>
  request<void>(`/power/shutdown/${id}`, { method: 'POST' });

export const rebootTarget = (id: string): Promise<void> =>
  request<void>(`/power/reboot/${id}`, { method: 'POST' });

export const fetchPowerStatus = (id: string): Promise<PowerStatus> =>
  request<PowerStatus>(`/power/status/${id}`);
