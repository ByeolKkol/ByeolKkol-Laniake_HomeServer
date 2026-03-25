import { createRequest } from './fetchJson';
import { getTapoApiBase } from './settingsStore';

const request = createRequest(getTapoApiBase);

export interface TapoDevice {
  id: number;
  name: string;
  cloud_id: string | null;
  model: string | null;
  ip: string | null;
  created_at: number;
  is_on: boolean | null;
  power_w: number | null;
  today_energy_wh: number | null;
  month_energy_wh: number | null;
  last_seen: number | null;
}

export interface TapoPowerPoint {
  ts: number;
  power_w: number;
  today_energy_wh: number;
}

export interface TapoDeviceHistory {
  device_id: number;
  name: string;
  points: TapoPowerPoint[];
}

export function fetchTapoDevices(): Promise<TapoDevice[]> {
  return request<TapoDevice[]>('/devices');
}

export function syncTapoDevices(): Promise<void> {
  return request<void>('/devices/sync', { method: 'POST' });
}

export function deleteTapoDevice(id: number): Promise<void> {
  return request<void>(`/devices/${id}`, { method: 'DELETE' });
}

export function setTapoDeviceIp(id: number, ip: string): Promise<void> {
  return request<void>(`/devices/${id}/ip`, {
    method: 'PATCH',
    body: JSON.stringify({ ip }),
  });
}

export function turnOn(id: number): Promise<void> {
  return request<void>(`/devices/${id}/on`, { method: 'POST' });
}

export function turnOff(id: number): Promise<void> {
  return request<void>(`/devices/${id}/off`, { method: 'POST' });
}

export interface TapoCredentials {
  username: string;
  has_password: boolean;
}

export function fetchTapoCredentials(): Promise<TapoCredentials> {
  return request<TapoCredentials>('/settings/tapo');
}

export function saveTapoCredentials(username: string, password: string): Promise<void> {
  return request<void>('/settings/tapo', {
    method: 'PUT',
    body: JSON.stringify({ username, password }),
  });
}

export function fetchTapoHistory(
  deviceId: number,
  params: { minutes?: number; start_ts?: number; end_ts?: number },
): Promise<TapoDeviceHistory> {
  const q = new URLSearchParams();
  if (params.minutes !== undefined) q.set('minutes', String(params.minutes));
  if (params.start_ts !== undefined) q.set('start_ts', String(params.start_ts));
  if (params.end_ts !== undefined) q.set('end_ts', String(params.end_ts));
  return request<TapoDeviceHistory>(`/history/${deviceId}?${q}`);
}
