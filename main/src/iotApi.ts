import { createRequest } from './fetchJson';
import { getIotApiBase } from './settingsStore';

const request = createRequest(getIotApiBase);

export interface IotDevice {
  id: number;
  name: string;
  mac_address: string;
  created_at: number;
  temperature: number | null;
  humidity: number | null;
  battery_mv: number | null;
  battery_pct: number | null;
  rssi: number | null;
  last_seen: number | null;
}

export interface IotReadingPoint {
  ts: number;
  temperature: number;
  humidity: number;
  battery_mv: number | null;
  battery_pct: number | null;
}

export interface IotDeviceHistory {
  device_id: number;
  name: string;
  points: IotReadingPoint[];
}

export function fetchIotDevices(): Promise<IotDevice[]> {
  return request<IotDevice[]>('/devices');
}

export function addIotDevice(
  name: string, mac_address: string,
): Promise<IotDevice> {
  return request<IotDevice>('/devices', {
    method: 'POST',
    body: JSON.stringify({ name, mac_address }),
  });
}

export function deleteIotDevice(id: number): Promise<void> {
  return request<void>(`/devices/${id}`, { method: 'DELETE' });
}

export function fetchIotHistory(
  deviceId: number,
  params: { minutes?: number; start_ts?: number; end_ts?: number },
): Promise<IotDeviceHistory> {
  const q = new URLSearchParams();
  if (params.minutes !== undefined) q.set('minutes', String(params.minutes));
  if (params.start_ts !== undefined) q.set('start_ts', String(params.start_ts));
  if (params.end_ts !== undefined) q.set('end_ts', String(params.end_ts));
  return request<IotDeviceHistory>(`/history/${deviceId}?${q}`);
}
