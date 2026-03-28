import { getHealthApiBase } from './settingsStore';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WeightRecord {
  id: number;
  ts: number;
  weight_kg: number;
  bmi: number | null;
  body_fat_pct: number | null;
  muscle_kg: number | null;
  bone_kg: number | null;
  visceral_fat: number | null;
  water_pct: number | null;
  bmr_kcal: number | null;
  source: string;
}

export interface HeartratePoint {
  ts: number;
  bpm: number;
}

export interface ExerciseRecord {
  id: number;
  started_at: number;
  ended_at: number;
  type: string | null;
  duration_min: number | null;
  calories: number | null;
  distance_m: number | null;
  source: string;
}

export interface MetricPoint {
  ts: number;
  value: number;
}

export interface MetricRecord {
  id: number;
  ts: number;
  metric: string;
  value: number;
  source: string;
}

export interface SleepStage {
  started_at: number;
  ended_at: number;
  stage: string;
}

export interface SleepRecord {
  id: number;
  started_at: number;
  ended_at: number;
  duration_min: number | null;
  source: string;
  stages: SleepStage[];
}

// ── Weight ────────────────────────────────────────────────────────────────────

export async function fetchLatestWeight(): Promise<WeightRecord> {
  const res = await fetch(`${getHealthApiBase()}/weight/latest`);
  if (!res.ok) throw new Error(`weight/latest: ${res.status}`);
  return res.json() as Promise<WeightRecord>;
}

export async function deleteWeightRecord(id: number): Promise<void> {
  const res = await fetch(`${getHealthApiBase()}/weight/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`weight delete: ${res.status}`);
}

export async function fetchWeightHistory(params: {
  limit?: number;
  start_ts?: number;
  end_ts?: number;
}): Promise<WeightRecord[]> {
  const q = new URLSearchParams();
  if (params.limit) q.set('limit', String(params.limit));
  if (params.start_ts) q.set('start_ts', String(params.start_ts));
  if (params.end_ts) q.set('end_ts', String(params.end_ts));
  const res = await fetch(`${getHealthApiBase()}/weight?${q}`);
  if (!res.ok) throw new Error(`weight: ${res.status}`);
  return res.json() as Promise<WeightRecord[]>;
}

// ── Heart Rate ────────────────────────────────────────────────────────────────

export async function fetchHeartrateHistory(params: {
  minutes?: number;
  start_ts?: number;
  end_ts?: number;
}): Promise<HeartratePoint[]> {
  const q = new URLSearchParams();
  if (params.minutes) q.set('minutes', String(params.minutes));
  if (params.start_ts) q.set('start_ts', String(params.start_ts));
  if (params.end_ts) q.set('end_ts', String(params.end_ts));
  const res = await fetch(`${getHealthApiBase()}/heartrate?${q}`);
  if (!res.ok) throw new Error(`heartrate: ${res.status}`);
  return res.json() as Promise<HeartratePoint[]>;
}

// ── Exercise ──────────────────────────────────────────────────────────────────

export async function fetchExerciseHistory(params: {
  limit?: number;
  start_ts?: number;
  end_ts?: number;
}): Promise<ExerciseRecord[]> {
  const q = new URLSearchParams();
  if (params.limit) q.set('limit', String(params.limit));
  if (params.start_ts) q.set('start_ts', String(params.start_ts));
  if (params.end_ts) q.set('end_ts', String(params.end_ts));
  const res = await fetch(`${getHealthApiBase()}/exercise?${q}`);
  if (!res.ok) throw new Error(`exercise: ${res.status}`);
  return res.json() as Promise<ExerciseRecord[]>;
}

// ── Generic Metric ────────────────────────────────────────────────────────────

export async function fetchMetricHistory(params: {
  metric: string;
  minutes?: number;
  start_ts?: number;
  end_ts?: number;
}): Promise<MetricPoint[]> {
  const q = new URLSearchParams();
  q.set('metric', params.metric);
  if (params.minutes) q.set('minutes', String(params.minutes));
  if (params.start_ts) q.set('start_ts', String(params.start_ts));
  if (params.end_ts) q.set('end_ts', String(params.end_ts));
  const res = await fetch(`${getHealthApiBase()}/metric?${q}`);
  if (!res.ok) throw new Error(`metric/${params.metric}: ${res.status}`);
  return res.json() as Promise<MetricPoint[]>;
}

export async function fetchLatestMetric(metric: string): Promise<MetricRecord | null> {
  const res = await fetch(`${getHealthApiBase()}/metric/latest?metric=${metric}`);
  if (!res.ok) return null;
  return res.json() as Promise<MetricRecord>;
}

// ── Sleep ─────────────────────────────────────────────────────────────────────

export async function fetchSleepHistory(params: {
  limit?: number;
  start_ts?: number;
  end_ts?: number;
}): Promise<SleepRecord[]> {
  const q = new URLSearchParams();
  if (params.limit) q.set('limit', String(params.limit));
  if (params.start_ts) q.set('start_ts', String(params.start_ts));
  if (params.end_ts) q.set('end_ts', String(params.end_ts));
  const res = await fetch(`${getHealthApiBase()}/sleep?${q}`);
  if (!res.ok) throw new Error(`sleep: ${res.status}`);
  return res.json() as Promise<SleepRecord[]>;
}

export async function fetchLatestSleep(): Promise<SleepRecord | null> {
  const res = await fetch(`${getHealthApiBase()}/sleep/latest`);
  if (!res.ok) return null;
  return res.json() as Promise<SleepRecord>;
}
