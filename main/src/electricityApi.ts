import { createRequest } from './fetchJson';
import { getTapoApiBase } from './settingsStore';

const request = createRequest(getTapoApiBase);

export interface ElectricityRate {
  tier: number;
  limit_kwh: number | null;
  base_won: number;
  rate_won: number;
}

export interface DeviceMonthlyUsage {
  device_id: number;
  name: string;
  kwh: number;
}

export interface MonthlyUsage {
  month: string;
  total_kwh: number;
  estimated_won: number;
  devices: DeviceMonthlyUsage[];
}

export function fetchRates(): Promise<ElectricityRate[]> {
  return request<ElectricityRate[]>('/electricity/rates');
}

export function saveRates(rates: ElectricityRate[]): Promise<void> {
  return request<void>('/electricity/rates', {
    method: 'PUT',
    body: JSON.stringify({ rates }),
  });
}

export function fetchMonthly(months = 6): Promise<MonthlyUsage[]> {
  return request<MonthlyUsage[]>(`/electricity/monthly?months=${months}`);
}
