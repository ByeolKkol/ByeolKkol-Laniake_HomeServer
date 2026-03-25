// ── 공통 차트 컴포넌트 (SVG 기반, 외부 의존성 없음) ──────────────────────────

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

interface AreaChartProps {
  points: number[];
  color: string;
}

/** 그라디언트 면적 차트 (실시간 소형) */
export const AreaChart = ({ points, color }: AreaChartProps): JSX.Element => {
  if (points.length < 2)
    return <div className="flex h-12 items-center text-xs text-app-muted">수집 중...</div>;

  const min = Math.min(...points);
  const max = Math.max(...points);
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
  const gid = `ag${color.replace(/\W/g, '')}`;

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

interface HistoryChartProps {
  points: number[];
  color: string;
  yMin: number;
  yMax: number;
  unit?: string;
  timestamps?: number[];
}

const _fmtTime = (ts: number): string => {
  const d = new Date(ts * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** 고정 범위 + 그리드 이력 차트 */
export const HistoryChart = ({
  points, color, yMin, yMax, unit = '', timestamps,
}: HistoryChartProps): JSX.Element => {
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
  const toX = (i: number): number =>
    PX + (i / (points.length - 1)) * (W - PX * 2);

  const coords = points.map((v, i) => ({ x: toX(i), y: toY(v) }));
  const linePts = coords.map((c) => `${c.x},${c.y}`).join(' ');
  const areaD =
    `M ${coords[0].x},${H} ` +
    coords.map((c) => `L ${c.x},${c.y}`).join(' ') +
    ` L ${coords[coords.length - 1].x},${H} Z`;
  const last = coords[coords.length - 1];
  const gid = `hc${color.replace(/\W/g, '')}`;

  const hGridTicks = [0.25, 0.5, 0.75].map((f) => ({
    value: Math.round(yMin + range * f),
    y: toY(yMin + range * f),
  }));

  // 세로 격자: 25%, 50%, 75% 위치
  const vTicks = [0.25, 0.5, 0.75].map((f) => {
    const x = PX + f * (W - PX * 2);
    const idx = Math.round(f * (points.length - 1));
    const label = timestamps ? _fmtTime(timestamps[idx]) : '';
    return { x, label };
  });

  // x축 레이블: SVG 내 격자 x 위치를 % 로 환산 (SVG width 기준)
  const xLabels = timestamps
    ? [
        { label: _fmtTime(timestamps[0]),                     pct: 0,    align: 'left'   as const },
        ...vTicks.map(({ x, label }) => ({ label, pct: (x / W) * 100, align: 'center' as const })),
        { label: _fmtTime(timestamps[timestamps.length - 1]), pct: 100,  align: 'right'  as const },
      ]
    : [];

  return (
    <div className="flex gap-1">
      {/* Y축 레이블 */}
      <div className="relative w-7 shrink-0 select-none">
        <span className="absolute right-0 translate-y-[-50%] text-[9px] text-app-muted"
          style={{ top: `${(toY(yMax) / H) * 100}%` }}>
          {Math.round(yMax)}{unit}
        </span>
        {hGridTicks.map(({ value, y }) => (
          <span key={value} className="absolute right-0 translate-y-[-50%] text-[9px] text-app-muted"
            style={{ top: `${(y / H) * 100}%` }}>
            {value}
          </span>
        ))}
        <span className="absolute right-0 translate-y-[-50%] text-[9px] text-app-muted"
          style={{ top: `${(toY(yMin) / H) * 100}%` }}>
          {yMin}{unit}
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
          {vTicks.map(({ x }) => (
            <line key={x} x1={x} y1={0} x2={x} y2={H}
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
        {/* X축 시간 레이블 — SVG 너비 기준 % 정렬 */}
        {xLabels.length > 0 && (
          <div className="relative h-3 select-none">
            {xLabels.map(({ label, pct, align }) => (
              <span key={pct} className="absolute text-[9px] text-app-muted"
                style={{
                  left: `${pct}%`,
                  transform: align === 'center' ? 'translateX(-50%)' : align === 'right' ? 'translateX(-100%)' : 'none',
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
