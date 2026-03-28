import { useCallback, useEffect, useMemo, useState } from 'react';
import { HistoryChart, FIXED_RANGE_PRESETS, type FixedRangeKey, type FixedTimeRange } from './Charts';
import {
  fetchExerciseHistory, fetchHeartrateHistory, fetchMetricHistory, fetchLatestMetric,
  type ExerciseRecord, type HeartratePoint, type MetricPoint, type MetricRecord,
} from './healthApi';

const fmtTime = (ts: number): string =>
  new Date(ts * 1000).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

const safeMax = (arr: number[]): number => arr.reduce((a, b) => Math.max(a, b), -Infinity);
const safeMin = (arr: number[]): number => arr.reduce((a, b) => Math.min(a, b), Infinity);

// ── Vital Card ────────────────────────────────────────────────────────────────

interface VitalConfig {
  metric: string;
  label: string;
  unit: string;
  color: string;
  yMin: number;
  yMax: number;
}

const VITALS_BEFORE: VitalConfig[] = [
  { metric: 'spo2', label: '산소포화도', unit: '%', color: '#38bdf8', yMin: 85, yMax: 100 },
];

const VITALS_AFTER: VitalConfig[] = [
  { metric: 'total_calories', label: '운동 칼로리', unit: 'kcal', color: '#fb923c', yMin: 0, yMax: 2000 },
  { metric: 'distance',       label: '이동 거리',   unit: 'm',    color: '#60a5fa', yMin: 0, yMax: 20000 },
];

const VitalCard = ({ cfg, fixedRange }: { cfg: VitalConfig; fixedRange: FixedTimeRange }): JSX.Element => {
  const [points, setPoints] = useState<MetricPoint[]>([]);
  const [latest, setLatest] = useState<MetricRecord | null>(null);

  useEffect(() => {
    fetchMetricHistory({ metric: cfg.metric, start_ts: fixedRange.startTs, end_ts: fixedRange.endTs })
      .then(setPoints).catch(() => {});
    fetchLatestMetric(cfg.metric)
      .then(setLatest).catch(() => {});
  }, [cfg.metric, fixedRange]);

  const values     = useMemo(() => points.map((p) => p.value), [points]);
  const timestamps = useMemo(() => points.map((p) => p.ts), [points]);
  const dynamicMax = values.length > 0 ? Math.max(cfg.yMax, safeMax(values) * 1.1) : cfg.yMax;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium text-app-muted">{cfg.label}</p>
        {latest && (
          <p className="text-xs font-bold" style={{ color: cfg.color }}>
            {cfg.metric === 'distance'
              ? `${(latest.value / 1000).toFixed(2)}km`
              : `${Number(latest.value.toFixed(1))}${cfg.unit}`}
          </p>
        )}
      </div>
      {values.length >= 2 ? (
        <HistoryChart points={values} color={cfg.color} yMin={cfg.yMin} yMax={dynamicMax}
          unit={cfg.unit} timestamps={timestamps} fixedRange={fixedRange} />
      ) : (
        <p className="py-4 text-center text-xs text-app-muted">데이터 없음</p>
      )}
    </div>
  );
};

// ── Activity Tab ──────────────────────────────────────────────────────────────

const ActivityTab = (): JSX.Element => {
  const [rangeKey, setRangeKey]       = useState<FixedRangeKey>('7d');
  const [hrPoints, setHrPoints]       = useState<HeartratePoint[]>([]);
  const [exercises, setExercises]     = useState<ExerciseRecord[]>([]);
  const [stepsPoints, setStepsPoints] = useState<MetricPoint[]>([]);
  const [error, setError] = useState('');

  const range = useMemo(() => FIXED_RANGE_PRESETS.find((p) => p.key === rangeKey)!.rangeFn(), [rangeKey]);

  const loadHr = useCallback(async (): Promise<void> => {
    try { setHrPoints(await fetchHeartrateHistory({ start_ts: range.startTs, end_ts: range.endTs })); }
    catch (e) { setError((e as Error).message); }
  }, [range]);

  const loadSteps = useCallback(async (): Promise<void> => {
    try { setStepsPoints(await fetchMetricHistory({ metric: 'steps', start_ts: range.startTs, end_ts: range.endTs })); }
    catch (e) { setError((e as Error).message); }
  }, [range]);

  const loadExercises = useCallback(async (): Promise<void> => {
    const end = Date.now() / 1000;
    const start = end - 30 * 86400;
    try { setExercises(await fetchExerciseHistory({ start_ts: start, end_ts: end })); }
    catch (e) { setError((e as Error).message); }
  }, []);

  useEffect(() => { void loadHr(); }, [loadHr]);
  useEffect(() => { void loadSteps(); }, [loadSteps]);
  useEffect(() => { void loadExercises(); }, [loadExercises]);

  const bpmValues    = useMemo(() => hrPoints.map((p) => p.bpm), [hrPoints]);
  const hrTimestamps = useMemo(() => hrPoints.map((p) => p.ts), [hrPoints]);
  const stepsValues  = useMemo(() => stepsPoints.map((p) => p.value), [stepsPoints]);
  const stepsTs      = useMemo(() => stepsPoints.map((p) => p.ts), [stepsPoints]);

  const bpmStats = useMemo(() => {
    if (bpmValues.length === 0) return null;
    const sum = bpmValues.reduce((a, b) => a + b, 0);
    return { avg: Math.round(sum / bpmValues.length), min: Math.round(safeMin(bpmValues)), max: Math.round(safeMax(bpmValues)) };
  }, [bpmValues]);

  // 운동 일별 집계 (현재 range 기준)
  const exerciseByDay = useMemo(() => {
    const map = new Map<number, { count: number; duration: number; calories: number }>();
    for (const ex of exercises) {
      if (ex.started_at < range.startTs || ex.started_at > range.endTs) continue;
      const bucket = Math.floor(ex.started_at / 86400) * 86400;
      const cur = map.get(bucket) ?? { count: 0, duration: 0, calories: 0 };
      map.set(bucket, {
        count: cur.count + 1,
        duration: cur.duration + (ex.duration_min ?? 0),
        calories: cur.calories + (ex.calories ?? 0),
      });
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [exercises, range]);

  const exTs       = useMemo(() => exerciseByDay.map(([ts]) => ts), [exerciseByDay]);
  const exFreq     = useMemo(() => exerciseByDay.map(([, v]) => v.count), [exerciseByDay]);
  const exDuration = useMemo(() => exerciseByDay.map(([, v]) => v.duration), [exerciseByDay]);
  const exCalories = useMemo(() => exerciseByDay.map(([, v]) => v.calories).filter((_, i) =>
    exerciseByDay[i][1].calories > 0), [exerciseByDay]);
  const exCalTs    = useMemo(() => exerciseByDay
    .filter(([, v]) => v.calories > 0).map(([ts]) => ts), [exerciseByDay]);

  return (
    <section className="space-y-4">
      {error && (
        <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>
      )}

      {/* 공통 기간 선택 */}
      <div className="flex gap-1">
        {FIXED_RANGE_PRESETS.map((p) => (
          <button key={p.key} onClick={() => setRangeKey(p.key)}
            className={`rounded-lg border px-2.5 py-0.5 text-xs transition ${
              rangeKey === p.key ? 'border-brand bg-brand/20 text-app-text' : 'border-transparent text-app-muted hover:border-app-border'}`}>
            {p.label}
          </button>
        ))}
      </div>

      {/* 통합 그래프 카드 */}
      <div className="rounded-xl border border-app-border bg-app-soft p-4 space-y-5">

        {/* 심박수 */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium text-app-muted">심박수</p>
            {bpmStats && (
              <div className="flex gap-3 text-[10px] text-app-muted">
                <span>평균 <span className="font-semibold text-app-text">{bpmStats.avg}bpm</span></span>
                <span>최저 <span className="font-semibold text-app-text">{bpmStats.min}bpm</span></span>
                <span>최고 <span className="font-semibold text-app-text">{bpmStats.max}bpm</span></span>
              </div>
            )}
          </div>
          {bpmValues.length >= 2 ? (
            <HistoryChart points={bpmValues} color="#f87171" yMin={40} yMax={180}
              unit="bpm" timestamps={hrTimestamps} fixedRange={range} />
          ) : (
            <p className="py-4 text-center text-xs text-app-muted">데이터 없음</p>
          )}
        </div>

        <div className="border-t border-app-border" />

        {/* 산소포화도 */}
        {VITALS_BEFORE.map((cfg) => (
          <div key={cfg.metric}>
            <VitalCard cfg={cfg} fixedRange={range} />
          </div>
        ))}

        <div className="border-t border-app-border" />

        {/* 걸음수 */}
        <div>
          <p className="mb-2 text-xs font-medium text-app-muted">걸음수</p>
          {stepsValues.length >= 2 ? (
            <HistoryChart points={stepsValues} color="#34d399" yMin={0}
              yMax={safeMax(stepsValues) * 1.2} unit="걸음" timestamps={stepsTs} fixedRange={range} />
          ) : (
            <p className="py-4 text-center text-xs text-app-muted">데이터 없음</p>
          )}
        </div>

        {/* 운동 빈도 */}
        <div>
          <p className="mb-2 text-xs font-medium text-app-muted">운동 빈도</p>
          {exFreq.length >= 2 ? (
            <HistoryChart points={exFreq} color="#c084fc" yMin={0}
              yMax={Math.max(safeMax(exFreq) * 1.5, 3)} unit="회" timestamps={exTs} fixedRange={range} />
          ) : (
            <p className="py-4 text-center text-xs text-app-muted">데이터 없음</p>
          )}
        </div>

        {/* 운동 시간 */}
        <div>
          <p className="mb-2 text-xs font-medium text-app-muted">운동 시간</p>
          {exDuration.length >= 2 ? (
            <HistoryChart points={exDuration} color="#f9a8d4" yMin={0}
              yMax={safeMax(exDuration) * 1.2} unit="분" timestamps={exTs} fixedRange={range} />
          ) : (
            <p className="py-4 text-center text-xs text-app-muted">데이터 없음</p>
          )}
        </div>

        {/* 운동 칼로리 소모 */}
        <div>
          <p className="mb-2 text-xs font-medium text-app-muted">운동 칼로리 소모</p>
          {exCalories.length >= 2 ? (
            <HistoryChart points={exCalories} color="#fde68a" yMin={0}
              yMax={safeMax(exCalories) * 1.2} unit="kcal" timestamps={exCalTs} fixedRange={range} decimals={0} />
          ) : (
            <p className="py-4 text-center text-xs text-app-muted">데이터 없음</p>
          )}
        </div>

        <div className="border-t border-app-border" />

        {/* 운동 칼로리 · 이동 거리 */}
        {VITALS_AFTER.map((cfg, i) => (
          <div key={cfg.metric}>
            <VitalCard cfg={cfg} fixedRange={range} />
            {i < VITALS_AFTER.length - 1 && <div className="mt-5 border-t border-app-border" />}
          </div>
        ))}
      </div>

      {/* 운동 기록 */}
      <div className="rounded-xl border border-app-border bg-app-soft p-4">
        <p className="mb-2 text-xs font-medium text-app-muted">최근 30일 운동 기록</p>
        {exercises.length === 0 ? (
          <p className="py-4 text-center text-sm text-app-muted">운동 기록 없음</p>
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

export default ActivityTab;
