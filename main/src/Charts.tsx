// ── 공통 차트 컴포넌트 (SVG 기반, 외부 의존성 없음) ──────────────────────────

import { useId } from 'react';

// ── 공용 헬퍼 ────────────────────────────────────────────────────────────────

export const fmtAgo = (ts: number | null): string => {
  if (ts == null) return '-';
  const s = Math.floor(Date.now() / 1000 - ts);
  if (s < 60) return `${s}초 전`;
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  return `${Math.floor(s / 3600)}시간 전`;
};

const safeMax = (arr: number[]): number => arr.reduce((a, b) => Math.max(a, b), -Infinity);
const safeMin = (arr: number[]): number => arr.reduce((a, b) => Math.min(a, b), Infinity);

// ── 고정 시간 범위 타입 + 프리셋 ─────────────────────────────────────────────

export interface FixedTimeRange {
  startTs: number;   // unix seconds (범위 시작)
  endTs: number;     // unix seconds (범위 끝)
  tickInterval: number; // seconds (틱 간격)
  labelFn: (ts: number) => string; // 틱 라벨 포매터
}

export type FixedRangeKey = '24h' | '7d' | '30d';

export interface FixedRangePreset {
  label: string;
  key: FixedRangeKey;
  rangeFn: () => FixedTimeRange;
}

/** 오늘 00:00~24:00, 10분 간격 */
export const todayRange = (): FixedTimeRange => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000;
  return { startTs: start, endTs: start + 86400, tickInterval: 600, labelFn: (ts) => {
    const h = Math.floor((ts - start) / 3600) % 24;
    const m = Math.floor(((ts - start) % 3600) / 60);
    return m === 0 ? `${String(h).padStart(2,'0')}` : '';
  }};
};

/** 이번 주 월~일, 1시간 간격 */
export const thisWeekRange = (): FixedTimeRange => {
  const now = new Date();
  const dow = now.getDay(); // 0=Sun
  const diffToMon = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMon);
  const start = mon.getTime() / 1000;
  const end = start + 7 * 86400;
  const dayLabels = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  return { startTs: start, endTs: end, tickInterval: 3600, labelFn: (ts) => {
    const elapsed = ts - start;
    const dayIdx = Math.floor(elapsed / 86400);
    const hourInDay = Math.floor((elapsed % 86400) / 3600);
    if (hourInDay === 12 && dayIdx >= 0 && dayIdx < 7) return dayLabels[dayIdx];
    return '';
  }};
};

/** 이번 달 1일~마지막일, 1일 간격 */
export const thisMonthRange = (): FixedTimeRange => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000;
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime() / 1000;
  return { startTs: start, endTs: end, tickInterval: 86400, labelFn: (ts) => {
    const d = new Date(ts * 1000);
    return String(d.getDate());
  }};
};

/** 공용 고정 범위 프리셋 (24시간 / 7일 / 30일) */
export const FIXED_RANGE_PRESETS: FixedRangePreset[] = [
  { label: '24시간', key: '24h', rangeFn: todayRange },
  { label: '7일',   key: '7d',  rangeFn: thisWeekRange },
  { label: '30일',  key: '30d', rangeFn: thisMonthRange },
];

/** 최근 N일 범위 — 날짜 기반 X축 (체중 등 일별 데이터용) */
export const lastNDaysRange = (n: number): FixedTimeRange => {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() / 1000;
  const start = end - n * 86400;
  const tickInterval = n <= 14 ? 86400 : n <= 60 ? 86400 * 3 : n <= 180 ? 86400 * 7 : 86400 * 30;
  return {
    startTs: start, endTs: end, tickInterval,
    labelFn: (ts) => {
      const elapsed = ts - start;
      const dayIdx = Math.floor(elapsed / 86400);
      if (dayIdx % Math.round(tickInterval / 86400) !== 0) return '';
      const d = new Date(ts * 1000);
      return n <= 60
        ? `${d.getMonth() + 1}/${d.getDate()}`
        : `${d.getMonth() + 1}월`;
    },
  };
};

export type WeightRangeKey = '7d' | '30d' | '90d' | '1y';

export interface WeightRangePreset {
  label: string;
  key: WeightRangeKey;
  days: number;
}

export const WEIGHT_RANGE_PRESETS: WeightRangePreset[] = [
  { label: '7일',  key: '7d',  days: 7 },
  { label: '30일', key: '30d', days: 30 },
  { label: '90일', key: '90d', days: 90 },
  { label: '1년',  key: '1y',  days: 365 },
];

export interface ShortPreset {
  label: string;
  minutes: number;
}

// ── GaugeRing ────────────────────────────────────────────────────────────────

interface GaugeRingProps {
  value: number;
  max?: number;
  color: string;
  size?: number;
  label: string;
  sublabel?: string;
}

/** 원형 게이지 링 */
export const GaugeRing = ({ value, max = 100, color, size = 80, label, sublabel }: GaugeRingProps): JSX.Element => {
  const sw = 7;
  const r = (size - sw) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(1, Math.max(0, value / max));
  const cx = size / 2;
  const cy = size / 2;

  return (
    <div className="flex flex-col items-center gap-0.5">
      <svg width={size} height={size}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1e293b" strokeWidth={sw} />
        <circle
          cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={sw}
          strokeDasharray={`${pct * circ} ${circ}`} strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: 'stroke-dasharray 0.5s ease' }}
        />
        <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
          fill={color} fontSize="13" fontWeight="700">{label}</text>
      </svg>
      {sublabel && <p className="text-[10px] text-app-muted">{sublabel}</p>}
    </div>
  );
};

// ── AreaChart ─────────────────────────────────────────────────────────────────

interface AreaChartProps {
  points: number[];
  color: string;
}

/** 그라디언트 면적 차트 (실시간 소형) */
export const AreaChart = ({ points, color }: AreaChartProps): JSX.Element => {
  const gid = useId();

  if (points.length < 2)
    return <div className="flex h-12 items-center text-xs text-app-muted">수집 중...</div>;

  const min = safeMin(points);
  const max = safeMax(points);
  const range = max - min || 1;
  const W = 400; const H = 48; const P = 3;

  const coords = points.map((v, i) => ({
    x: P + (i / (points.length - 1)) * (W - P * 2),
    y: H - P - ((v - min) / range) * (H - P * 2 - 6),
  }));
  const linePts = coords.map((c) => `${c.x},${c.y}`).join(' ');
  const areaD =
    `M ${coords[0].x},${H} ` +
    coords.map((c) => `L ${c.x},${c.y}`).join(' ') +
    ` L ${coords[coords.length - 1].x},${H} Z`;
  const last = coords[coords.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-12 w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#${gid})`} />
      <polyline points={linePts} fill="none" stroke={color} strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last.x} cy={last.y} r="3" fill={color} />
    </svg>
  );
};

// ── HistoryChart ──────────────────────────────────────────────────────────────

interface HistoryChartProps {
  points: number[];
  color: string;
  yMin: number;
  yMax: number;
  unit?: string;
  decimals?: number;
  timestamps?: number[];
  fixedRange?: FixedTimeRange;
}

const _fmtTime = (ts: number): string => {
  const d = new Date(ts * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** 고정 범위 + 그리드 이력 차트 */
export const HistoryChart = ({
  points, color, yMin, yMax, unit = '', decimals = 1, timestamps, fixedRange,
}: HistoryChartProps): JSX.Element => {
  const gid = useId();

  if (points.length < 2)
    return (
      <div className="flex h-28 items-center justify-center text-xs text-app-muted">
        데이터 수집 중...
      </div>
    );

  const range = yMax - yMin || 1;
  const W = 400; const H = 100; const PX = 2; const PY = 3;

  const toY = (v: number): number =>
    H - PY - ((Math.min(Math.max(v, yMin), yMax) - yMin) / range) * (H - PY * 2);

  // fixedRange가 있으면 timestamp 기반 X 좌표, 아니면 인덱스 기반
  const hasFixed = fixedRange && timestamps;
  const toX = hasFixed
    ? (ts: number) => PX + ((ts - fixedRange.startTs) / (fixedRange.endTs - fixedRange.startTs)) * (W - PX * 2)
    : (_ts: number, i: number) => PX + (i / (points.length - 1)) * (W - PX * 2);

  const coords = hasFixed
    ? points.map((v, i) => ({ x: toX(timestamps[i], i), y: toY(v) }))
    : points.map((v, i) => ({ x: toX(0, i), y: toY(v) }));

  const linePts = coords.map((c) => `${c.x},${c.y}`).join(' ');
  const areaD =
    `M ${coords[0].x},${H} ` +
    coords.map((c) => `L ${c.x},${c.y}`).join(' ') +
    ` L ${coords[coords.length - 1].x},${H} Z`;
  const last = coords[coords.length - 1];

  const hGridTicks = [0.5]
    .map((f) => ({ value: parseFloat((yMin + range * f).toFixed(1)), y: toY(yMin + range * f) }))
    .filter(({ value }) => value !== yMin && value !== yMax)
    .filter(({ value }, i, arr) => arr.findIndex(t => t.value === value) === i);

  // X축 틱 생성
  const xTicks: { pct: number; label: string }[] = (() => {
    if (hasFixed) {
      const totalSec = fixedRange.endTs - fixedRange.startTs;
      const ticks: { pct: number; label: string }[] = [];
      for (let t = fixedRange.startTs; t <= fixedRange.endTs; t += fixedRange.tickInterval) {
        const label = fixedRange.labelFn(t);
        if (label) {
          ticks.push({ pct: ((t - fixedRange.startTs) / totalSec) * 100, label });
        }
      }
      return ticks;
    }
    if (timestamps) {
      return [0, 0.25, 0.5, 0.75, 1].map((f) => {
        const idx = Math.round(f * (timestamps.length - 1));
        return { pct: f * 100, label: _fmtTime(timestamps[idx]) };
      });
    }
    return [];
  })();

  // 수직 그리드: fixedRange이면 틱 위치, 아니면 25/50/75%
  const vGridLines = hasFixed
    ? xTicks.map((t) => PX + (t.pct / 100) * (W - PX * 2)).filter((_, i) => i % Math.max(1, Math.floor(xTicks.length / 6)) === 0)
    : [0.25, 0.5, 0.75].map((f) => PX + f * (W - PX * 2));

  return (
    <div className="flex items-start gap-1">
      {/* Y축 레이블 */}
      <div className="relative h-28 w-7 shrink-0 select-none">
        <span className="absolute right-0 translate-y-[-50%] text-[9px] text-app-muted"
          style={{ top: `${(toY(yMax) / H) * 100}%` }}>
          {yMax.toFixed(decimals)}{unit}
        </span>
        {hGridTicks.map(({ value, y }) => (
          <span key={value} className="absolute right-0 translate-y-[-50%] text-[9px] text-app-muted"
            style={{ top: `${(y / H) * 100}%` }}>
            {value.toFixed(decimals)}
          </span>
        ))}
        <span className="absolute right-0 translate-y-[-50%] text-[9px] text-app-muted"
          style={{ top: `${(toY(yMin) / H) * 100}%` }}>
          {yMin.toFixed(decimals)}{unit}
        </span>
      </div>
      {/* 차트 + X축 레이블 */}
      <div className="flex flex-1 flex-col gap-0.5">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-28 w-full" preserveAspectRatio="none">
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.3" />
              <stop offset="100%" stopColor={color} stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {/* 수평 그리드 */}
          {hGridTicks.map(({ value, y }) => (
            <line key={value} x1={0} y1={y} x2={W} y2={y}
              stroke="#ffffff" strokeOpacity="0.08" strokeWidth="1" strokeDasharray="4,4" />
          ))}
          {/* 수직 그리드 */}
          {vGridLines.map((x, i) => (
            <line key={i} x1={x} y1={0} x2={x} y2={H}
              stroke="#ffffff" strokeOpacity="0.08" strokeWidth="1" strokeDasharray="4,4" />
          ))}
          {/* 최상단·최하단 경계선 */}
          <line x1={0} y1={toY(yMax)} x2={W} y2={toY(yMax)}
            stroke="#ffffff" strokeOpacity="0.04" strokeWidth="1" />
          <line x1={0} y1={toY(yMin)} x2={W} y2={toY(yMin)}
            stroke="#ffffff" strokeOpacity="0.04" strokeWidth="1" />
          <path d={areaD} fill={`url(#${gid})`} />
          <polyline points={linePts} fill="none" stroke={color} strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={last.x} cy={last.y} r="2.5" fill={color} />
        </svg>
        {/* X축 시간 레이블 */}
        {xTicks.length > 0 && (
          <div className="relative h-3 select-none">
            {xTicks.map(({ label, pct }, i) => (
              <span key={`${pct}-${i}`} className="absolute text-[8px] text-app-muted"
                style={{
                  left: `${pct}%`,
                  transform: pct >= 99 ? 'translateX(-100%)' : pct <= 1 ? 'none' : 'translateX(-50%)',
                }}>
                {label}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ── UsageBar ─────────────────────────────────────────────────────────────────

interface UsageBarProps {
  percent: number;
  colorCls?: string;
}

/** 수평 진행 바 */
export const UsageBar = ({ percent, colorCls = 'bg-emerald-500' }: UsageBarProps): JSX.Element => (
  <div className="h-1.5 w-full overflow-hidden rounded-full bg-app-border">
    <div
      className={`h-full rounded-full transition-all duration-500 ${colorCls}`}
      style={{ width: `${Math.min(100, percent)}%` }}
    />
  </div>
);

// ── PulseDot ─────────────────────────────────────────────────────────────────

interface PulseDotProps {
  active: boolean;
  colorCls?: string;
}

/** 상태 펄스 도트 */
export const PulseDot = ({ active, colorCls = 'bg-emerald-500' }: PulseDotProps): JSX.Element => (
  <span className="relative flex h-2.5 w-2.5 shrink-0">
    {active && (
      <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${colorCls} opacity-60`} />
    )}
    <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${active ? colorCls : 'bg-gray-600'}`} />
  </span>
);

// ── 색상 헬퍼 ────────────────────────────────────────────────────────────────

export const usageColorHex = (pct: number): string => {
  if (pct > 90) return '#f87171';
  if (pct > 70) return '#fbbf24';
  return '#34d399';
};

export const usageColorCls = (pct: number): string => {
  if (pct > 90) return 'bg-rose-500';
  if (pct > 70) return 'bg-amber-400';
  return 'bg-emerald-500';
};

export const tempColorHex = (t: number | null): string => {
  if (t == null) return '#6b7280';
  if (t > 85) return '#f87171';
  if (t > 70) return '#fbbf24';
  if (t > 55) return '#fde047';
  return '#34d399';
};

export const tempColorCls = (t: number | null): string => {
  if (t == null) return 'text-app-muted';
  if (t > 85) return 'text-rose-400';
  if (t > 70) return 'text-amber-400';
  if (t > 55) return 'text-yellow-300';
  return 'text-emerald-400';
};

export const fmtBytes = (bytes: number, decimals = 1): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(decimals)} ${sizes[i]}`;
};
