import { useCallback, useEffect, useMemo, useState } from 'react';
import { HistoryChart } from './Charts';
import {
  fetchExerciseHistory, fetchHeartrateHistory, fetchWeightHistory, fetchLatestWeight,
  type ExerciseRecord, type HeartratePoint, type WeightRecord,
} from './healthApi';

// ── helpers ───────────────────────────────────────────────────────────────────
const fmtDate = (ts: number): string =>
  new Date(ts * 1000).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
const fmtTime = (ts: number): string =>
  new Date(ts * 1000).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const fmtKg = (v: number | null): string => (v != null ? `${v.toFixed(1)}kg` : '-');
const fmtPct = (v: number | null): string => (v != null ? `${v.toFixed(1)}%` : '-');
const fmtInt = (v: number | null): string => (v != null ? String(v) : '-');

const WEIGHT_PRESETS = [
  { label: '7일',  days: 7 },
  { label: '30일', days: 30 },
  { label: '90일', days: 90 },
  { label: '1년',  days: 365 },
];

const HR_PRESETS = [
  { label: '1시간',  minutes: 60 },
  { label: '6시간',  minutes: 360 },
  { label: '24시간', minutes: 1440 },
  { label: '7일',   minutes: 10080 },
];

// ── WeightTabContent ──────────────────────────────────────────────────────────
const WeightTabContent = (): JSX.Element => {
  const [records, setRecords]   = useState<WeightRecord[]>([]);
  const [latest, setLatest]     = useState<WeightRecord | null>(null);
  const [rangeDays, setRangeDays] = useState(30);
  const [error, setError]       = useState('');

  const load = useCallback(async (): Promise<void> => {
    const end = Date.now() / 1000;
    const start = end - rangeDays * 86400;
    try {
      const [recs, lat] = await Promise.all([
        fetchWeightHistory({ start_ts: start, end_ts: end }),
        fetchLatestWeight().catch(() => null),
      ]);
      setRecords(recs);
      setLatest(lat);
    } catch (e) { setError((e as Error).message); }
  }, [rangeDays]);

  useEffect(() => { void load(); }, [load]);

  const weightPoints = useMemo(() => records.map((r) => r.weight_kg).reverse(), [records]);
  const timestamps   = useMemo(() => records.map((r) => r.ts).reverse(), [records]);

  if (error) {
    return (
      <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
        {error}
      </p>
    );
  }

  return (
    <section className="space-y-4">
      {/* 최신 체성분 카드 */}
      {latest && (
        <div className="rounded-xl border border-app-border bg-app-soft p-4">
          <p className="mb-3 text-xs font-medium text-app-muted">최신 측정 — {fmtDate(latest.ts)}</p>
          <div className="grid grid-cols-4 gap-3 sm:grid-cols-8">
            {[
              { label: '체중',     value: fmtKg(latest.weight_kg),    color: '#60a5fa' },
              { label: 'BMI',      value: fmtInt(latest.bmi),          color: '#a78bfa' },
              { label: '체지방률', value: fmtPct(latest.body_fat_pct), color: '#f87171' },
              { label: '근육량',   value: fmtKg(latest.muscle_kg),     color: '#34d399' },
              { label: '골량',     value: fmtKg(latest.bone_kg),       color: '#fbbf24' },
              { label: '내장지방', value: fmtInt(latest.visceral_fat), color: '#fb923c' },
              { label: '수분율',   value: fmtPct(latest.water_pct),    color: '#38bdf8' },
              { label: '기초대사', value: latest.bmr_kcal != null ? `${latest.bmr_kcal}kcal` : '-', color: '#e879f9' },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-lg bg-app-border/30 px-2 py-2 text-center">
                <p className="text-[10px] text-app-muted">{label}</p>
                <p className="text-sm font-bold" style={{ color }}>{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 체중 추이 그래프 */}
      <div className="rounded-xl border border-app-border bg-app-soft p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">체중 추이</p>
          <div className="flex gap-1">
            {WEIGHT_PRESETS.map((p) => (
              <button key={p.days}
                onClick={() => setRangeDays(p.days)}
                className={`rounded-lg border px-2.5 py-0.5 text-xs transition ${
                  rangeDays === p.days
                    ? 'border-brand bg-brand/20 text-app-text'
                    : 'border-transparent text-app-muted hover:border-app-border'}`}>
                {p.label}
              </button>
            ))}
          </div>
          <span className="ml-auto text-[10px] text-app-muted">{records.length}건</span>
        </div>
        {weightPoints.length >= 2 ? (
          <HistoryChart points={weightPoints} color="#60a5fa" yMin={30} yMax={150} unit="kg" timestamps={timestamps} />
        ) : (
          <p className="py-6 text-center text-sm text-app-muted">
            {records.length === 0 ? '체중 기록 없음 (체중계 연동 후 자동 수집)' : '데이터 부족 (최소 2건 필요)'}
          </p>
        )}
      </div>

      {/* 기록 테이블 */}
      {records.length > 0 && (
        <div className="rounded-xl border border-app-border bg-app-soft p-4">
          <p className="mb-2 text-xs font-medium text-app-muted">측정 기록</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-app-border text-app-muted">
                  <th className="py-1 text-left">날짜</th>
                  <th className="py-1 text-right">체중</th>
                  <th className="py-1 text-right">BMI</th>
                  <th className="py-1 text-right">체지방</th>
                  <th className="py-1 text-right">근육량</th>
                  <th className="py-1 text-right">출처</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id} className="border-b border-app-border/40">
                    <td className="py-1">{fmtDate(r.ts)}</td>
                    <td className="py-1 text-right font-medium text-blue-400">{fmtKg(r.weight_kg)}</td>
                    <td className="py-1 text-right">{fmtInt(r.bmi)}</td>
                    <td className="py-1 text-right">{fmtPct(r.body_fat_pct)}</td>
                    <td className="py-1 text-right">{fmtKg(r.muscle_kg)}</td>
                    <td className="py-1 text-right text-app-muted">{r.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
};

// ── ActivityTabContent ────────────────────────────────────────────────────────
const ActivityTabContent = (): JSX.Element => {
  const [hrPoints, setHrPoints]     = useState<HeartratePoint[]>([]);
  const [exercises, setExercises]   = useState<ExerciseRecord[]>([]);
  const [hrMinutes, setHrMinutes]   = useState(1440);
  const [error, setError]           = useState('');

  const loadHr = useCallback(async (): Promise<void> => {
    try { setHrPoints(await fetchHeartrateHistory({ minutes: hrMinutes })); }
    catch (e) { setError((e as Error).message); }
  }, [hrMinutes]);

  const loadExercises = useCallback(async (): Promise<void> => {
    const end = Date.now() / 1000;
    const start = end - 30 * 86400;
    try { setExercises(await fetchExerciseHistory({ start_ts: start, end_ts: end })); }
    catch (e) { setError((e as Error).message); }
  }, []);

  useEffect(() => { void loadHr(); }, [loadHr]);
  useEffect(() => { void loadExercises(); }, [loadExercises]);

  const bpmValues  = useMemo(() => hrPoints.map((p) => p.bpm), [hrPoints]);
  const timestamps = useMemo(() => hrPoints.map((p) => p.ts), [hrPoints]);

  const bpmStats = useMemo(() => {
    if (bpmValues.length === 0) return null;
    const sum = bpmValues.reduce((a, b) => a + b, 0);
    return { avg: Math.round(sum / bpmValues.length), min: Math.min(...bpmValues), max: Math.max(...bpmValues) };
  }, [bpmValues]);

  return (
    <section className="space-y-4">
      {error && (
        <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {error}
        </p>
      )}

      {/* 심박수 그래프 */}
      <div className="rounded-xl border border-app-border bg-app-soft p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">심박수</p>
          <div className="flex gap-1">
            {HR_PRESETS.map((p) => (
              <button key={p.minutes}
                onClick={() => setHrMinutes(p.minutes)}
                className={`rounded-lg border px-2.5 py-0.5 text-xs transition ${
                  hrMinutes === p.minutes
                    ? 'border-brand bg-brand/20 text-app-text'
                    : 'border-transparent text-app-muted hover:border-app-border'}`}>
                {p.label}
              </button>
            ))}
          </div>
          <span className="ml-auto text-[10px] text-app-muted">{hrPoints.length}포인트</span>
        </div>
        {bpmValues.length >= 2 ? (
          <HistoryChart points={bpmValues} color="#f87171" yMin={40} yMax={180} unit="bpm" timestamps={timestamps} />
        ) : (
          <p className="py-6 text-center text-sm text-app-muted">
            심박수 기록 없음 (Galaxy Watch 연동 후 자동 수집)
          </p>
        )}
        {bpmStats && (
          <div className="mt-2 grid grid-cols-3 gap-2 text-center text-[10px] text-app-muted">
            <div><p>평균</p><p className="font-semibold text-app-text">{bpmStats.avg}bpm</p></div>
            <div><p>최저</p><p className="font-semibold text-app-text">{bpmStats.min}bpm</p></div>
            <div><p>최고</p><p className="font-semibold text-app-text">{bpmStats.max}bpm</p></div>
          </div>
        )}
      </div>

      {/* 운동 기록 */}
      <div className="rounded-xl border border-app-border bg-app-soft p-4">
        <p className="mb-2 text-xs font-medium text-app-muted">최근 30일 운동 기록</p>
        {exercises.length === 0 ? (
          <p className="py-4 text-center text-sm text-app-muted">운동 기록 없음 (Galaxy Watch 연동 후 자동 수집)</p>
        ) : (
          <div className="space-y-2">
            {exercises.map((ex) => (
              <div key={ex.id} className="flex items-center justify-between rounded-lg border border-app-border/40 px-3 py-2">
                <div>
                  <p className="text-sm font-medium">{ex.type ?? '운동'}</p>
                  <p className="text-[10px] text-app-muted">{fmtTime(ex.started_at)}</p>
                </div>
                <div className="flex gap-3 text-right text-xs text-app-muted">
                  {ex.duration_min != null && <span>{ex.duration_min}분</span>}
                  {ex.calories != null && <span className="text-orange-400">{ex.calories}kcal</span>}
                  {ex.distance_m != null && <span>{(ex.distance_m / 1000).toFixed(2)}km</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

// ── HealthTab ─────────────────────────────────────────────────────────────────
export type HealthTabKey = 'weight' | 'activity';

interface Props { view: HealthTabKey }

const HealthTab = ({ view }: Props): JSX.Element => (
  <>
    {view === 'weight'   && <WeightTabContent />}
    {view === 'activity' && <ActivityTabContent />}
  </>
);

export default HealthTab;
