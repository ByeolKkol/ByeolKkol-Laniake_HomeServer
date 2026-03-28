import { HistoryChart, type FixedTimeRange } from './Charts';
import { type WeightRecord } from './healthApi';

interface ChartConfig {
  label: string;
  color: string;
  unit: string;
  decimals?: number;
  getValue: (r: WeightRecord) => number | null | undefined;
}

const CONFIGS: ChartConfig[] = [
  { label: 'BMI',      color: '#a78bfa', unit: '',     getValue: r => r.bmi },
  { label: '체지방률', color: '#f87171', unit: '%',    getValue: r => r.body_fat_pct },
  { label: '근육량',   color: '#34d399', unit: 'kg',   getValue: r => r.muscle_kg },
  { label: '골량',     color: '#fbbf24', unit: 'kg',   getValue: r => r.bone_kg },
  { label: '수분율',   color: '#38bdf8', unit: '%',    getValue: r => r.water_pct },
  { label: '기초대사', color: '#e879f9', unit: 'kcal', decimals: 0, getValue: r => r.bmr_kcal },
  { label: '내장지방', color: '#fb923c', unit: '',     getValue: r => r.visceral_fat },
];

const calcYRange = (vals: number[], decimals = 1): [number, number] => {
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const step = Math.pow(10, -decimals);
  const pad = Math.max((max - min) * 0.15, step);
  const lo = parseFloat((min - pad).toFixed(decimals));
  const hi = parseFloat((max + pad).toFixed(decimals));
  if (lo >= hi) return [lo, parseFloat((lo + step * 2).toFixed(decimals))];
  return [lo, hi];
};

interface MiniProps {
  config: ChartConfig;
  records: WeightRecord[];
  fixedRange: FixedTimeRange;
}

const MiniChart = ({ config, records, fixedRange }: MiniProps): JSX.Element => {
  const pairs = [...records]
    .reverse()
    .flatMap(r => {
      const v = config.getValue(r);
      return v != null ? [{ v, ts: r.ts }] : [];
    });

  if (pairs.length < 2) return (
    <div className="rounded-xl border border-app-border bg-app-soft p-3">
      <p className="mb-1 text-xs font-medium" style={{ color: config.color }}>{config.label}</p>
      <p className="py-4 text-center text-xs text-app-muted">데이터 부족</p>
    </div>
  );

  const [yMin, yMax] = calcYRange(pairs.map(p => p.v), config.decimals);

  return (
    <div className="rounded-xl border border-app-border bg-app-soft p-3">
      <p className="mb-2 text-xs font-medium" style={{ color: config.color }}>{config.label}</p>
      <HistoryChart
        points={pairs.map(p => p.v)}
        timestamps={pairs.map(p => p.ts)}
        color={config.color}
        yMin={yMin}
        yMax={yMax}
        unit={config.unit}
        decimals={config.decimals}
        fixedRange={fixedRange}
      />
    </div>
  );
};

interface Props {
  records: WeightRecord[];
  fixedRange: FixedTimeRange;
}

export const WeightChartsSection = ({ records, fixedRange }: Props): JSX.Element => {
  const ordered = [...records].reverse();
  const wVals = ordered.map(r => r.weight_kg);
  const [wMin, wMax] = calcYRange(wVals);

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-app-border bg-app-soft p-4">
        <p className="mb-3 text-xs font-medium" style={{ color: '#60a5fa' }}>체중</p>
        {ordered.length >= 2 ? (
          <HistoryChart
            points={wVals}
            timestamps={ordered.map(r => r.ts)}
            color="#60a5fa"
            yMin={wMin}
            yMax={wMax}
            unit="kg"
            fixedRange={fixedRange}
          />
        ) : (
          <p className="py-6 text-center text-sm text-app-muted">데이터 부족 (최소 2건 필요)</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {CONFIGS.map(cfg => (
          <MiniChart key={cfg.label} config={cfg} records={records} fixedRange={fixedRange} />
        ))}
      </div>
    </div>
  );
};
