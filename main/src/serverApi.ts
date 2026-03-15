export interface HardwareStatus {
  battery_capacity: number | null;
  battery_limit: number | null;
  profile: string | null;
  cpu_temp: number | null;
  display_brightness: number | null;
}

import { getServerApiBase } from './settingsStore';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${getServerApiBase()}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Server API error ${res.status}: ${body}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function fetchServerStatus(): Promise<HardwareStatus> {
  return request<HardwareStatus>('/status');
}

export function setBatteryLimit(limit: number): Promise<void> {
  return request<void>('/battery/limit', {
    method: 'POST',
    body: JSON.stringify({ limit }),
  });
}

export function setProfile(profile: string): Promise<void> {
  return request<void>('/profile', {
    method: 'POST',
    body: JSON.stringify({ profile }),
  });
}

export function setLed(color: string): Promise<void> {
  return request<void>('/led', {
    method: 'POST',
    body: JSON.stringify({ color }),
  });
}

export function setDisplayBrightness(brightness: number): Promise<void> {
  return request<void>('/display/brightness', {
    method: 'POST',
    body: JSON.stringify({ brightness }),
  });
}

export function turnOffDisplay(): Promise<void> {
  return request<void>('/display/off', { method: 'POST' });
}

export function turnOnDisplay(): Promise<void> {
  return request<void>('/display/on', { method: 'POST' });
}

export interface MemoryInfo {
  total: number;
  used: number;
  available: number;
  cached: number;
  free: number;
  percent: number;
}

export interface DiskInfo {
  mountpoint: string;
  total: number;
  used: number;
  free: number;
  percent: number;
}

export interface NetworkInfo {
  bytes_sent: number;
  bytes_recv: number;
}

export interface SystemMetrics {
  cpu_usage: number;
  memory: MemoryInfo;
  disks: DiskInfo[];
  network: NetworkInfo;
}

export function fetchMetrics(): Promise<SystemMetrics> {
  return request<SystemMetrics>('/metrics');
}
