import { useEffect, useRef, useMemo, useState } from 'react';
import { fetchSleepHistory, type SleepRecord, type SleepStage } from './healthApi';

// ── helpers ───────────────────────────────────────────────────────────────────

const STAGE_COLORS: Record<string, string> = {
  Deep: '#6366f1', REM: '#818cf8', Light: '#a5b4fc', Awake: '#fbbf24', AwakeInBed: '#fb923c',
  Sleeping: '#c4b5fd', OutOfBed: '#94a3b8', Unknown: '#64748b',
};
const STAGE_DEPTH: Record<string, number> = {
  Awake: 0, AwakeInBed: 0, OutOfBed: 0, Light: 1, REM: 2, Sleeping: 2, Deep: 3,
};
const STAGE_LABELS = ['깨어있음', '얕은 수면', 'REM', '깊은 수면'];

const fmtDate = (ts: number): string =>
  new Date(ts * 1000).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
const fmtSleepTime = (ts: number): string =>
  new Date(ts * 1000).toLocaleString('ko-KR', { hour: '2-digit', minute: '2-digit' });
const fmtDuration = (min: number | null): string => {
  if (min == null) return '-';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
};

const toDateKey = (ts: number): string => {
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ── 날짜별 수면 합산 ─────────────────────────────────────────────────────────

interface DailySleep {
  dateStr: string;
  totalMin: number;
  records: SleepRecord[];
  stages: SleepStage[];
}

const groupByDate = (records: SleepRecord[]): DailySleep[] => {
  const map = new Map<string, DailySleep>();
  for (const r of records) {
    const key = toDateKey(r.started_at);
    const existing = map.get(key);
    if (existing) {
      existing.totalMin += r.duration_min ?? 0;
      existing.records.push(r);
      existing.stages.push(...r.stages);
    } else {
      map.set(key, {
        dateStr: key,
        totalMin: r.duration_min ?? 0,
        records: [r],
        stages: [...r.stages],
      });
    }
  }
  return [...map.values()].sort((a, b) => b.dateStr.localeCompare(a.dateStr));
};

const calcStageTotals = (stages: SleepStage[]): Record<string, number> | null => {
  if (!stages.length) return null;
  const totals: Record<string, number> = {};
  for (const s of stages) {
    totals[s.stage] = (totals[s.stage] ?? 0) + (s.ended_at - s.started_at);
  }
  return totals;
};

const calcStats = (dailyList: DailySleep[]): { avg: number; max: number; min: number; days: number } | null => {
  if (dailyList.length === 0) return null;
  const mins = dailyList.map((d) => d.totalMin);
  return {
    avg: Math.round(mins.reduce((a, b) => a + b, 0) / mins.length),
    max: mins.reduce((a, b) => Math.max(a, b), -Infinity),
    min: mins.reduce((a, b) => Math.min(a, b), Infinity),
    days: mins.length,
  };
};

const ANALYSIS_PRESETS = [
  { label: '7일',  days: 7 },
  { label: '1개월', days: 30 },
  { label: '12개월', days: 365 },
];

const STAGE_DISPLAY = [
  { key: 'Deep',  label: '깊은 수면', color: STAGE_COLORS.Deep },
  { key: 'REM',   label: 'REM',       color: STAGE_COLORS.REM },
  { key: 'Light', label: '얕은 수면', color: STAGE_COLORS.Light },
  { key: 'Awake', label: '깨어있음',  color: STAGE_COLORS.Awake },
];

// ── SleepDepthChart ──────────────────────────────────────────────────────────

const SleepDepthChart = ({ stages, dateStr }: {
  stages: SleepStage[];
  dateStr: string;
}): JSX.Element => {
  const W = 600;
  const H = 80;
  const PAD = { top: 6, right: 6, bottom: 16, left: 44 };
  const cw = W - PAD.left - PAD.right;
  const ch = H - PAD.top - PAD.bottom;

  const [year, mon, day] = dateStr.split('-').map(Number);
  const dayStart = new Date(year, mon - 1, day, 0, 0, 0).getTime() / 1000;
  const dayEnd = dayStart + 86400;

  const x = (ts: number) => PAD.left + ((ts - dayStart) / 86400) * cw;
  const y = (depth: number) => PAD.top + ch - (depth / 3) * ch;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet">
      {STAGE_LABELS.map((label, i) => (
        <text key={label} x={PAD.left - 3} y={y(i) + 2} textAnchor="end" className="fill-app-muted" style={{ fontSize: 6 }}>{label}</text>
      ))}
      {[0, 1, 2, 3].map((d) => (
        <line key={d} x1={PAD.left} x2={W - PAD.right} y1={y(d)} y2={y(d)} stroke="currentColor" className="text-app-border" strokeWidth={0.5} />
      ))}
      {stages.map((s, i) => {
        const depth = STAGE_DEPTH[s.stage] ?? 1;
        const color = STAGE_COLORS[s.stage] ?? STAGE_COLORS.Unknown;
        const clampStart = Math.max(s.started_at, dayStart);
        const clampEnd = Math.min(s.ended_at, dayEnd);
        if (clampStart >= clampEnd) return null;
        const sx = x(clampStart);
        const ex = x(clampEnd);
        const sy = y(depth);
        const baseY = y(0);
        return <rect key={i} x={sx} y={sy} width={Math.max(ex - sx, 1)} height={baseY - sy} fill={color} opacity={0.8} />;
      })}
      {Array.from({ length: 25 }, (_, i) => i).map((h) => (
        <text key={h} x={x(dayStart + h * 3600)} y={H - 3} textAnchor="middle" className="fill-app-muted" style={{ fontSize: 5 }}>
          {String(h % 24).padStart(2, '0')}
        </text>
      ))}
    </svg>
  );
};

// ── SleepHeatmap ─────────────────────────────────────────────────────────────

const DOW_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DEPTH_COLORS = ['transparent', '#fbbf24', '#a5b4fc', '#818cf8', '#6366f1'];

const SleepHeatmap = ({ records, selectedDate, onSelectDate }: {
  records: SleepRecord[];
  selectedDate: string | null;
  onSelectDate: (dateStr: string) => void;
}): JSX.Element => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setContainerW(e.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const CELL = 14;
  const GAP = 1;
  const COL_W = CELL + GAP;
  const PAD = { top: 44, left: 28, right: 4, bottom: 4 };

  const maxDays = containerW > 0
    ? Math.max(7, Math.floor((containerW - PAD.left - PAD.right) / COL_W))
    : 30;

  const days = useMemo(() => {
    const result: Date[] = [];
    const now = new Date();
    for (let i = maxDays - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      result.push(d);
    }
    return result;
  }, [maxDays]);

  const grid: number[][] = useMemo(() => {
    const g: number[][] = Array.from({ length: maxDays }, () => Array(24).fill(0));
    const dayMap = new Map<string, number>();
    days.forEach((d, i) => dayMap.set(toDateKey(d.getTime() / 1000), i));

    for (const rec of records) {
      for (const s of rec.stages) {
        const depth = (STAGE_DEPTH[s.stage] ?? 0) + 1;
        const startMs = s.started_at * 1000;
        const endMs = s.ended_at * 1000;
        for (let ms = startMs; ms < endMs; ms += 3600_000) {
          const d = new Date(ms);
          const key = toDateKey(d.getTime() / 1000);
          const idx = dayMap.get(key);
          if (idx == null) continue;
          const hour = d.getHours();
          if (depth > g[idx][hour]) g[idx][hour] = depth;
        }
      }
    }
    return g;
  }, [records, days]);

  const W = PAD.left + maxDays * COL_W + PAD.right;
  const H = PAD.top + 24 * (CELL + GAP) + PAD.bottom;

  return (
    <div ref={containerRef}>
      {containerW > 0 && (
        <>
          <svg width={W} height={H}>
            {Array.from({ length: 24 }, (_, h) => (
              h % 2 === 0 ? (
                <text key={h} x={PAD.left - 4} y={PAD.top + h * (CELL + GAP) + CELL / 2 + 3}
                  textAnchor="end" className="fill-app-muted" style={{ fontSize: 8 }}>
                  {String(h).padStart(2, '0')}
                </text>
              ) : null
            ))}
            {days.map((d, i) => {
              const key = toDateKey(d.getTime() / 1000);
              const isSelected = selectedDate === key;
              const dow = d.getDay();
              const isSunday = dow === 0;
              return (
                <g key={key} onClick={() => onSelectDate(key)} style={{ cursor: 'pointer' }}>
                  {isSelected && (
                    <rect x={PAD.left + i * COL_W - 1} y={0}
                      width={COL_W + 1} height={H} rx={3}
                      fill="#6366f1" opacity={0.15} />
                  )}
                  {(d.getDate() === 1 || i === 0) && (
                    <text x={PAD.left + i * COL_W + CELL / 2} y={PAD.top - 30}
                      textAnchor="middle" className="fill-app-muted"
                      style={{ fontSize: 7 }}>
                      {MONTH_LABELS[d.getMonth()]}
                    </text>
                  )}
                  <text x={PAD.left + i * COL_W + CELL / 2} y={PAD.top - 20}
                    textAnchor="middle"
                    fill={isSunday ? '#f87171' : undefined}
                    className={isSunday ? '' : 'fill-app-muted'}
                    style={{ fontSize: 7, fontWeight: isSelected ? 700 : 400 }}>
                    {String(d.getDate()).padStart(2, '0')}
                  </text>
                  <text x={PAD.left + i * COL_W + CELL / 2} y={PAD.top - 10}
                    textAnchor="middle"
                    fill={isSunday ? '#f87171' : undefined}
                    className={isSunday ? '' : 'fill-app-muted'}
                    style={{ fontSize: 7, fontWeight: isSelected || isSunday ? 700 : 400 }}>
                    {DOW_LABELS[dow]}
                  </text>
                  {grid[i].map((depth, hour) => (
                    <rect key={hour}
                      x={PAD.left + i * COL_W}
                      y={PAD.top + hour * (CELL + GAP)}
                      width={CELL} height={CELL} rx={2}
                      fill={depth > 0 ? DEPTH_COLORS[depth] : 'currentColor'}
                      className={depth === 0 ? 'text-app-border/30' : ''}
                      opacity={depth > 0 ? 0.85 : 1}
                    />
                  ))}
                </g>
              );
            })}
          </svg>
          <div className="mt-2 flex items-center justify-center gap-3 text-[10px] text-app-muted">
            {[
              { label: '깨어있음', color: DEPTH_COLORS[1] },
              { label: '얕은 수면', color: DEPTH_COLORS[2] },
              { label: 'REM', color: DEPTH_COLORS[3] },
              { label: '깊은 수면', color: DEPTH_COLORS[4] },
            ].map(({ label, color }) => (
              <span key={label} className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
                {label}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

// ── SleepTab (main) ──────────────────────────────────────────────────────────

const SleepTab = (): JSX.Element => {
  const [sleepRecords, setSleepRecords] = useState<SleepRecord[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [analysisDays, setAnalysisDays] = useState(30);
  const [error, setError] = useState('');

  useEffect(() => {
    const end = Date.now() / 1000;
    const start = end - 365 * 86400;
    fetchSleepHistory({ start_ts: start, end_ts: end })
      .then((recs) => {
        setSleepRecords(recs);
        if (recs.length > 0) setSelectedDate(toDateKey(recs[0].started_at));
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  const dailyAll = useMemo(() => groupByDate(sleepRecords), [sleepRecords]);

  const analysisDaily = useMemo(() => {
    const cutoff = Date.now() / 1000 - analysisDays * 86400;
    return dailyAll.filter((d) => {
      const [y, m, day] = d.dateStr.split('-').map(Number);
      return new Date(y, m - 1, day).getTime() / 1000 >= cutoff;
    });
  }, [dailyAll, analysisDays]);

  const analysisStats = useMemo(() => calcStats(analysisDaily), [analysisDaily]);

  const selectedDaily = useMemo(() =>
    dailyAll.find((d) => d.dateStr === selectedDate) ?? null,
  [dailyAll, selectedDate]);

  const stageSummary = useMemo(() =>
    selectedDaily ? calcStageTotals(selectedDaily.stages) : null,
  [selectedDaily]);

  return (
    <section className="space-y-4">
      {error && (
        <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>
      )}

      {/* 수면 패턴 (선택 날짜, 기본값: 최근) */}
      {selectedDaily && (
        <div className="rounded-xl border border-app-border bg-app-soft p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium">수면 패턴</p>
            <p className="text-xs text-app-muted">
              {fmtDate(selectedDaily.records[0].started_at)}
              {' '}
              {selectedDaily.records.map((r) =>
                `${fmtSleepTime(r.started_at)}~${fmtSleepTime(r.ended_at)}`
              ).join(', ')}
              <span className="ml-2 text-indigo-400">{fmtDuration(selectedDaily.totalMin)}</span>
            </p>
          </div>
          {selectedDaily.stages.length > 0 && (
            <SleepDepthChart stages={selectedDaily.stages} dateStr={selectedDaily.dateStr} />
          )}
          {stageSummary && (
            <div className="mt-3 grid grid-cols-4 gap-2 text-center">
              {STAGE_DISPLAY.map(({ key, label, color }) => (
                <div key={key} className="rounded-lg bg-app-border/30 px-1 py-2">
                  <p className="text-[10px] text-app-muted">{label}</p>
                  <p className="text-sm font-bold" style={{ color }}>{fmtDuration(Math.round((stageSummary[key] ?? 0) / 60))}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 수면 분석 */}
      <div className="rounded-xl border border-app-border bg-app-soft p-4">
        <div className="mb-3 flex items-center gap-2">
          <p className="text-sm font-medium">수면 분석</p>
          <div className="flex gap-1">
            {ANALYSIS_PRESETS.map((p) => (
              <button key={p.days} onClick={() => setAnalysisDays(p.days)}
                className={`rounded-lg border px-2.5 py-0.5 text-xs transition ${
                  analysisDays === p.days
                    ? 'border-brand bg-brand/20 text-app-text'
                    : 'border-transparent text-app-muted hover:border-app-border'
                }`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
        {analysisStats ? (
          <div className="grid grid-cols-4 gap-3 text-center">
            <div className="rounded-lg bg-app-border/30 px-2 py-3">
              <p className="text-[10px] text-app-muted">평균 수면</p>
              <p className="text-lg font-bold text-indigo-400">{fmtDuration(analysisStats.avg)}</p>
            </div>
            <div className="rounded-lg bg-app-border/30 px-2 py-3">
              <p className="text-[10px] text-app-muted">최장</p>
              <p className="text-lg font-bold text-indigo-400">{fmtDuration(analysisStats.max)}</p>
            </div>
            <div className="rounded-lg bg-app-border/30 px-2 py-3">
              <p className="text-[10px] text-app-muted">최단</p>
              <p className="text-lg font-bold text-indigo-400">{fmtDuration(analysisStats.min)}</p>
            </div>
            <div className="rounded-lg bg-app-border/30 px-2 py-3">
              <p className="text-[10px] text-app-muted">기록일</p>
              <p className="text-lg font-bold text-indigo-400">{analysisStats.days}일</p>
            </div>
          </div>
        ) : (
          <p className="py-4 text-center text-sm text-app-muted">해당 기간 수면 기록 없음</p>
        )}
      </div>

      {/* 수면 히트맵 */}
      <div className="rounded-xl border border-app-border bg-app-soft p-4">
        <p className="mb-3 text-sm font-medium">수면 히트맵</p>
        {sleepRecords.length === 0 ? (
          <p className="py-4 text-center text-sm text-app-muted">수면 기록 없음</p>
        ) : (
          <SleepHeatmap records={sleepRecords} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
        )}
      </div>

    </section>
  );
};

export default SleepTab;
