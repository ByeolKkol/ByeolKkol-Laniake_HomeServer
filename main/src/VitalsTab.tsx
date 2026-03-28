import { useEffect, useMemo, useState } from 'react';
import { HistoryChart, FIXED_RANGE_PRESETS, type FixedRangeKey, type FixedTimeRange } from './Charts';
import { fetchMetricHistory, fetchLatestMetric, type MetricPoint, type MetricRecord } from './healthApi';

const safeMax = (arr: number[]): number => arr.reduce((a, b) => Math.max(a, b), -Infinity);

interface VitalConfig {
  metric: string;
  label: string;
  unit: string;
  color: string;
  yMin: number;
  yMax: number;
}

const VITALS: VitalConfig[] = [
  { metric: 'spo2',             label: '산소포화도', unit: '%',    color: '#38bdf8', yMin: 85, yMax: 100 },
  { metric: 'total_calories',   label: '운동 칼로리', unit: 'kcal', color: '#fb923c', yMin: 0,  yMax: 2000 },
  { metric: 'distance',         label: '이동 거리',  unit: 'm',    color: '#60a5fa', yMin: 0,  yMax: 20000 },
];

const VitalCard = ({ cfg, fixedRange }: { cfg: VitalConfig; fixedRange: FixedTimeRange }): JSX.Element => {
  const [points, setPoints] = useState<MetricPoint[]>([]);
  const [latest, setLatest] = useState<MetricRecord | null>(null);

  useEffect(() => {
    fetchMetricHistory({ metric: cfg.metric, start_ts: fixedRange.startTs, end_ts: fixedRange.endTs })
      .then(setPoints)
      .catch((e) => console.warn(`fetchMetric(${cfg.metric}) failed:`, e));
    fetchLatestMetric(cfg.metric)
      .then(setLatest)
      .catch((e) => console.warn(`fetchLatestMetric(${cfg.metric}) failed:`, e));
  }, [cfg.metric, fixedRange]);

  const values = useMemo(() => points.map((p) => p.value), [points]);
  const timestamps = useMemo(() => points.map((p) => p.ts), [points]);
  const dynamicMax = values.length > 0 ? Math.max(cfg.yMax, safeMax(values) * 1.1) : cfg.yMax;

  return (
    <div className="rounded-xl border border-app-border bg-app-soft p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-medium">{cfg.label}</p>
        {latest && (
          <p className="text-sm font-bold" style={{ color: cfg.color }}>
            {cfg.metric === 'distance' ? `${(latest.value / 1000).toFixed(2)}km` : `${Number(latest.value.toFixed(1))}${cfg.unit}`}
          </p>
        )}
      </div>
      {values.length >= 2 ? (
        <HistoryChart points={values} color={cfg.color} yMin={cfg.yMin} yMax={dynamicMax} unit={cfg.unit} timestamps={timestamps} fixedRange={fixedRange} />
      ) : (
        <p className="py-4 text-center text-xs text-app-muted">데이터 없음</p>
      )}
    </div>
  );
};

const VitalsTab = (): JSX.Element => {
  const [rangeKey, setRangeKey] = useState<FixedRangeKey>('7d');
  const fixedRange = useMemo(() => FIXED_RANGE_PRESETS.find((p) => p.key === rangeKey)!.rangeFn(), [rangeKey]);

  return (
    <section className="space-y-4">
      <div className="flex gap-1">
        {FIXED_RANGE_PRESETS.map((p) => (
          <button key={p.key} onClick={() => setRangeKey(p.key)}
            className={`rounded-lg border px-2.5 py-0.5 text-xs transition ${
              rangeKey === p.key ? 'border-brand bg-brand/20 text-app-text' : 'border-transparent text-app-muted hover:border-app-border'}`}>
            {p.label}
          </button>
        ))}
      </div>
      {VITALS.map((cfg) => (
        <VitalCard key={cfg.metric} cfg={cfg} fixedRange={fixedRange} />
      ))}
    </section>
  );
};

export default VitalsTab;
