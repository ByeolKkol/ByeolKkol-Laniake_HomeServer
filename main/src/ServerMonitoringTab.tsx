import { useEffect, useMemo, useState } from 'react';
import {
  fetchMetrics, fetchMetricsHistory, fetchServerStatus,
  type HardwareStatus, type MetricPoint, type SystemMetrics,
} from './serverApi';
import {
  AreaChart, GaugeRing, HistoryChart, PulseDot, UsageBar,
  fmtBytes, tempColorCls, tempColorHex, usageColorCls, usageColorHex,
} from './Charts';

const fmtBps = (bps: number): string => `${fmtBytes(bps)}/s`;

interface RangeOption {
  label: string;
  minutes: number;
}

interface NetRates {
  sent: number;
  recv: number;
}

interface LiveSnap {
  time: number;
  netSent: number;
  netRecv: number;
}

const RANGE_OPTIONS: RangeOption[] = [
  { label: '5분',   minutes: 5 },
  { label: '10분',  minutes: 10 },
  { label: '30분',  minutes: 30 },
  { label: '1시간', minutes: 60 },
  { label: '6시간', minutes: 360 },
  { label: '24시간', minutes: 1440 },
];

const batteryColorCls = (cap: number): string => {
  if (cap > 60) return 'bg-emerald-500';
  if (cap > 30) return 'bg-amber-400';
  return 'bg-rose-500';
};

const fmtTs = (ts: number): string => {
  const d = new Date(ts * 1000);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
};

const ServerMonitoringTab = (): JSX.Element => {
  const [hw, setHw]           = useState<HardwareStatus | null>(null);
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [history, setHistory] = useState<MetricPoint[]>([]);
  const [rangeMins, setRangeMins] = useState<number>(30);
  const [liveSnaps, setLiveSnaps] = useState<LiveSnap[]>([]);
  const [error, setError] = useState<string>('');

  // 실시간 폴링 (게이지·네트워크 속도용)
  useEffect(() => {
    const poll = async (): Promise<void> => {
      try {
        const [h, m] = await Promise.all([fetchServerStatus(), fetchMetrics()]);
        setHw(h);
        setMetrics(m);
        setError('');
        setLiveSnaps((prev) => [...prev, {
          time: Date.now(),
          netSent: m.network.bytes_sent,
          netRecv: m.network.bytes_recv,
        }].slice(-10));
      } catch (e) {
        setError((e as Error).message);
      }
    };
    void poll();
    const id = window.setInterval(() => void poll(), 5000);
    return () => window.clearInterval(id);
  }, []);

  // 이력 데이터 폴링 (범위 변경 시 즉시 + 15초마다 갱신)
  useEffect(() => {
    const fetch = async (): Promise<void> => {
      try {
        const res = await fetchMetricsHistory(rangeMins);
        setHistory(res.points);
      } catch { /* silent */ }
    };
    void fetch();
    const id = window.setInterval(() => void fetch(), 15000);
    return () => window.clearInterval(id);
  }, [rangeMins]);

  const netRates = useMemo((): NetRates => {
    if (liveSnaps.length < 2) return { sent: 0, recv: 0 };
    const last = liveSnaps[liveSnaps.length - 1];
    const prev = liveSnaps[liveSnaps.length - 2];
    const dt = (last.time - prev.time) / 1000;
    return {
      sent: Math.max(0, (last.netSent - prev.netSent) / dt),
      recv: Math.max(0, (last.netRecv - prev.netRecv) / dt),
    };
  }, [liveSnaps]);

  const cpuPoints  = useMemo(() => history.map((p) => p.cpu_pct), [history]);
  const memPoints  = useMemo(() => history.map((p) => p.mem_pct), [history]);
  const tempPoints = useMemo(() => history.map((p) => p.cpu_temp ?? 0), [history]);
  const recvPoints = useMemo(() => history.flatMap((p) => p.net_recv_bps != null ? [p.net_recv_bps] : []), [history]);
  const sentPoints = useMemo(() => history.flatMap((p) => p.net_sent_bps != null ? [p.net_sent_bps] : []), [history]);

  const cpuStats = useMemo(() => {
    if (cpuPoints.length < 2) return null;
    const sum = cpuPoints.reduce((a, b) => a + b, 0);
    return { avg: (sum / cpuPoints.length).toFixed(1), max: Math.max(...cpuPoints).toFixed(1) };
  }, [cpuPoints]);

  const startLabel   = history.length > 0 ? fmtTs(history[0].ts) : '';
  const endLabel     = history.length > 0 ? fmtTs(history[history.length - 1].ts) : '';
  const historyTs    = useMemo(() => history.map((p) => p.ts), [history]);

  const mem    = metrics?.memory;
  const disks  = metrics?.disks ?? [];
  const cpuPct = metrics?.cpu_usage ?? 0;
  const memPct = mem?.percent ?? 0;
  const temp   = hw?.cpu_temp ?? null;
  const cap    = hw?.battery_capacity ?? 0;

  const memLabels: [string, number, string][] = [
    ['Used',  mem?.used ?? 0,      'text-rose-400'],
    ['Cached', mem?.cached ?? 0,   'text-amber-300'],
    ['Free',  mem?.free ?? 0,      'text-emerald-400'],
    ['Avail', mem?.available ?? 0, 'text-sky-400'],
  ];

  const netLabels: [string, number, string][] = [
    ['↑ 송신', netRates.sent, 'text-sky-400'],
    ['↓ 수신', netRates.recv, 'text-emerald-400'],
  ];

  return (
    <section className="space-y-4">
      {error && (
        <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {error}
        </p>
      )}

      {/* ── 시간 범위 선택기 ── */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-app-muted">범위:</span>
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.minutes}
            onClick={() => setRangeMins(opt.minutes)}
            className={`rounded-lg border px-3 py-1 text-xs transition ${
              rangeMins === opt.minutes
                ? 'border-brand bg-brand/20 text-app-text'
                : 'border-transparent text-app-muted hover:border-app-border hover:bg-app-soft'
            }`}
          >
            {opt.label}
          </button>
        ))}
        <span className="ml-auto text-[10px] text-app-muted">
          {history.length > 0 ? `${history.length}포인트` : '수집 중...'}
        </span>
      </div>

      {/* ── CPU + 온도 ── */}
      <div className="grid gap-3 lg:grid-cols-2">

        <article className="rounded-xl border border-app-border bg-app-soft p-4">
          <div className="mb-3 flex items-center gap-4">
            <GaugeRing value={cpuPct} color={usageColorHex(cpuPct)} size={72}
              label={`${cpuPct.toFixed(0)}%`} sublabel="CPU" />
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium">CPU 사용률</p>
                {cpuStats && (
                  <p className="text-[10px] text-app-muted">
                    평균 {cpuStats.avg}% · 최대 {cpuStats.max}%
                  </p>
                )}
              </div>
            </div>
          </div>
          <HistoryChart points={cpuPoints} color={usageColorHex(cpuPct)}
            yMin={0} yMax={100} unit="%" timestamps={historyTs} />
        </article>

        <article className="rounded-xl border border-app-border bg-app-soft p-4">
          <div className="mb-3 flex items-center gap-4">
            <GaugeRing value={temp ?? 0} max={100} color={tempColorHex(temp)} size={72}
              label={temp != null ? `${temp.toFixed(0)}°` : '-'} sublabel="온도" />
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium">CPU 온도</p>
                <p className={`text-xs font-semibold ${tempColorCls(temp)}`}>
                  {temp != null ? `${temp.toFixed(1)}°C` : '-'}
                </p>
              </div>
              <div className="mt-1 flex gap-3 text-[10px] text-app-muted">
                <span className="text-emerald-400">● &lt;55°C 정상</span>
                <span className="text-yellow-300">● 55–70°C 주의</span>
                <span className="text-rose-400">● &gt;85°C 위험</span>
              </div>
            </div>
          </div>
          <HistoryChart points={tempPoints} color={tempColorHex(temp)}
            yMin={0} yMax={100} unit="°" timestamps={historyTs} />
        </article>

        {/* 메모리 */}
        <article className="rounded-xl border border-app-border bg-app-soft p-4">
          <div className="mb-3 flex items-center gap-4">
            <GaugeRing value={memPct} color={usageColorHex(memPct)} size={72}
              label={`${memPct.toFixed(0)}%`} sublabel="메모리" />
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium">메모리 사용률</p>
                {mem && (
                  <p className="text-[10px] text-app-muted">
                    {fmtBytes(mem.used)} / {fmtBytes(mem.total)}
                  </p>
                )}
              </div>
              {mem && (
                <div className="mt-2 grid grid-cols-4 gap-1">
                  {memLabels.map(([l, v, cls]) => (
                    <div key={l} className="rounded bg-app-border/30 px-2 py-1 text-center">
                      <p className="text-[9px] text-app-muted">{l}</p>
                      <p className={`text-[10px] font-semibold ${cls}`}>{fmtBytes(v, 0)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <HistoryChart points={memPoints} color={usageColorHex(memPct)}
            yMin={0} yMax={100} unit="%" timestamps={historyTs} />
        </article>

        {/* 네트워크 + 배터리 */}
        <article className="rounded-xl border border-app-border bg-app-soft p-4">
          {/* 현재 속도 */}
          <p className="mb-2 text-xs font-medium">네트워크</p>
          <div className="mb-3 grid grid-cols-2 gap-3">
            {netLabels.map(([label, val, cls]) => (
              <div key={label} className="rounded-lg bg-app-border/30 px-3 py-2">
                <p className="text-[10px] text-app-muted">{label} (현재)</p>
                <p className={`font-mono text-sm font-bold ${cls}`}>{fmtBps(val)}</p>
              </div>
            ))}
          </div>
          {/* 수신 추이 */}
          <div className="mb-1 flex items-center justify-between">
            <p className="text-[10px] text-app-muted">↓ 수신 추이</p>
            {recvPoints.length > 0 && (
              <p className="text-[10px] text-app-muted">
                최대 {fmtBps(Math.max(...recvPoints))}
              </p>
            )}
          </div>
          <AreaChart points={recvPoints} color="#34d399" />
          {/* 송신 추이 */}
          <div className="mb-1 mt-3 flex items-center justify-between">
            <p className="text-[10px] text-app-muted">↑ 송신 추이</p>
            {sentPoints.length > 0 && (
              <p className="text-[10px] text-app-muted">
                최대 {fmtBps(Math.max(...sentPoints))}
              </p>
            )}
          </div>
          <AreaChart points={sentPoints} color="#38bdf8" />
          {/* X축 시간 */}
          {(startLabel || endLabel) && (
            <div className="mt-0.5 flex justify-between text-[9px] text-app-muted">
              <span>{startLabel}</span><span>{endLabel}</span>
            </div>
          )}
          {/* 배터리 */}
          <div className="mt-4 border-t border-app-border pt-3">
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <PulseDot active={cap > 10} colorCls={batteryColorCls(cap)} />
                <span>배터리</span>
              </div>
              <span className="font-semibold">{hw?.battery_capacity != null ? `${cap}%` : '-'}</span>
            </div>
            <UsageBar percent={cap} colorCls={batteryColorCls(cap)} />
            <div className="mt-1.5 flex justify-between text-[10px] text-app-muted">
              {hw?.battery_limit != null && <span>충전 제한 {hw.battery_limit}%</span>}
              {hw?.profile && <span>팬: <span className="text-brand">{hw.profile}</span></span>}
            </div>
          </div>
        </article>
      </div>

      {/* ── 디스크 ── */}
      <article className="rounded-xl border border-app-border bg-app-soft p-4">
        <h3 className="mb-3 text-sm font-semibold">디스크</h3>
        <div className="space-y-3">
          {disks.length === 0 && <p className="text-xs text-app-muted">-</p>}
          {disks.map((d) => (
            <div key={d.mountpoint}>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="font-mono">{d.mountpoint}</span>
                <span className="text-app-muted">
                  {fmtBytes(d.used)} / {d.total > 0 ? fmtBytes(d.total) : '-'}
                  {d.total > 0 && (
                    <span className="ml-1 font-semibold" style={{ color: usageColorHex(d.percent) }}>
                      {d.percent.toFixed(1)}%
                    </span>
                  )}
                </span>
              </div>
              {d.total > 0
                ? <UsageBar percent={d.percent} colorCls={usageColorCls(d.percent)} />
                : <p className="text-xs text-app-muted">스왑 없음</p>
              }
            </div>
          ))}
        </div>
      </article>
    </section>
  );
};

export default ServerMonitoringTab;
