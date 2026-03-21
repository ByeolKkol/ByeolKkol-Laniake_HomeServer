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

// ── Weight ────────────────────────────────────────────────────────────────────

export async function fetchLatestWeight(): Promise<WeightRecord> {
  const res = await fetch(`${getHealthApiBase()}/weight/latest`);
  if (!res.ok) throw new Error(`weight/latest: ${res.status}`);
  return res.json() as Promise<WeightRecord>;
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
