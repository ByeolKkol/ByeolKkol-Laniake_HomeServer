import { useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchMetrics,
  fetchServerStatus,
  type HardwareStatus,
  type SystemMetrics,
} from './serverApi';

// ── 상수 ──────────────────────────────────────────────────────────────────────
const MAX_HISTORY = 30; // 30 × 5초 = 2.5분
const POLL_MS = 5000;

// ── 유틸리티 ──────────────────────────────────────────────────────────────────
function fmtBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(decimals)} ${sizes[i]}`;
}

function fmtRate(bytesPerSec: number): string {
  return `${fmtBytes(bytesPerSec)}/s`;
}

// ── Sparkline (SVG) ───────────────────────────────────────────────────────────
function Sparkline({ points, color }: { points: number[]; color: string }) {
  if (points.length < 2)
    return <div className="flex h-10 items-center text-xs text-app-muted">수집 중...</div>;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const W = 300;
  const H = 40;
  const P = 2;

  const pts = points
    .map((v, i) => {
      const x = P + (i / (points.length - 1)) * (W - P * 2);
      const y = H - P - ((v - min) / range) * (H - P * 2);
      return `${x},${y}`;
    })
    .join(' ');

  const allPts = pts.split(' ');
  const last = allPts[allPts.length - 1].split(',');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-10 w-full" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="3" fill={color} />
    </svg>
  );
}

// ── UsageBar ──────────────────────────────────────────────────────────────────
function UsageBar({ percent, color = 'bg-brand' }: { percent: number; color?: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-app-border">
      <div
        className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${Math.min(100, percent)}%` }}
      />
    </div>
  );
}

function barColor(pct: number): string {
  if (pct > 90) return 'bg-rose-500';
  if (pct > 70) return 'bg-amber-400';
  return 'bg-emerald-500';
}

function tempColor(t: number | null): string {
  if (t == null) return 'text-app-muted';
  if (t > 85) return 'text-rose-400';
  if (t > 70) return 'text-amber-400';
  if (t > 55) return 'text-yellow-300';
  return 'text-emerald-400';
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
interface SnapShot {
  time: number;
  cpu: number;
  mem: number;
  netSent: number;
  netRecv: number;
  cpuTemp: number | null;
}

export default function ServerMonitoringTab() {
  const [hw, setHw] = useState<HardwareStatus | null>(null);
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [history, setHistory] = useState<SnapShot[]>([]);
  const [error, setError] = useState('');
  const startRef = useRef(Date.now());

  useEffect(() => {
    const poll = async () => {
      try {
        const [h, m] = await Promise.all([fetchServerStatus(), fetchMetrics()]);
        setHw(h);
        setMetrics(m);
        setError('');
        setHistory((prev) => {
          const next: SnapShot = {
            time: Date.now(),
            cpu: m.cpu_usage,
            mem: m.memory.percent,
            netSent: m.network.bytes_sent,
            netRecv: m.network.bytes_recv,
            cpuTemp: h.cpu_temp,
          };
          return [...prev, next].slice(-MAX_HISTORY);
        });
      } catch (e) {
        setError((e as Error).message);
      }
    };

    void poll();
    const id = window.setInterval(() => void poll(), POLL_MS);
    return () => window.clearInterval(id);
  }, []);

  // 네트워크 rate 계산 (마지막 두 스냅샷 delta)
  const netRates = useMemo(() => {
    if (history.length < 2) return { sent: 0, recv: 0 };
    const last = history[history.length - 1];
    const prev = history[history.length - 2];
    const dt = (last.time - prev.time) / 1000;
    return {
      sent: Math.max(0, (last.netSent - prev.netSent) / dt),
      recv: Math.max(0, (last.netRecv - prev.netRecv) / dt),
    };
  }, [history]);

  const cpuHistory = useMemo(() => history.map((s) => s.cpu), [history]);
  const memHistory = useMemo(() => history.map((s) => s.mem), [history]);
  const tempHistory = useMemo(() => history.flatMap((s) => (s.cpuTemp != null ? [s.cpuTemp] : [])), [history]);

  const elapsed = Math.floor((Date.now() - startRef.current) / 1000);
  const elapsedStr =
    elapsed < 60 ? `${elapsed}초` : `${Math.floor(elapsed / 60)}분 ${elapsed % 60}초`;

  const mem = metrics?.memory;
  const disks = metrics?.disks ?? [];

  return (
    <section className="space-y-4">
      {error && (
        <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {error}
        </p>
      )}

      {/* ── 상단 요약 카드 ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* CPU 사용률 */}
        <article className="rounded-xl border border-app-border bg-app-soft p-4">
          <p className="text-xs text-app-muted">CPU 사용률</p>
          <p className={`mt-1 text-2xl font-bold ${barColor(metrics?.cpu_usage ?? 0).replace('bg-', 'text-')}`}>
            {metrics?.cpu_usage != null ? `${metrics.cpu_usage.toFixed(1)}%` : '-'}
          </p>
          <div className="mt-2">
            <UsageBar percent={metrics?.cpu_usage ?? 0} color={barColor(metrics?.cpu_usage ?? 0)} />
          </div>
        </article>

        {/* CPU 온도 */}
        <article className="rounded-xl border border-app-border bg-app-soft p-4">
          <p className="text-xs text-app-muted">CPU 온도</p>
          <p className={`mt-1 text-2xl font-bold ${tempColor(hw?.cpu_temp ?? null)}`}>
            {hw?.cpu_temp != null ? `${hw.cpu_temp.toFixed(1)}°C` : '-'}
          </p>
          <p className="mt-1 text-xs text-app-muted">
            팬: <span className="text-app-text">{hw?.profile ?? '-'}</span>
          </p>
        </article>

        {/* 메모리 */}
        <article className="rounded-xl border border-app-border bg-app-soft p-4">
          <p className="text-xs text-app-muted">메모리</p>
          <p className={`mt-1 text-2xl font-bold ${barColor(mem?.percent ?? 0).replace('bg-', 'text-')}`}>
            {mem ? `${mem.percent.toFixed(1)}%` : '-'}
          </p>
          <div className="mt-2">
            <UsageBar percent={mem?.percent ?? 0} color={barColor(mem?.percent ?? 0)} />
          </div>
          <p className="mt-1 text-xs text-app-muted">
            {mem ? `${fmtBytes(mem.used)} / ${fmtBytes(mem.total)}` : '-'}
          </p>
        </article>

        {/* 네트워크 */}
        <article className="rounded-xl border border-app-border bg-app-soft p-4">
          <p className="text-xs text-app-muted">네트워크</p>
          <p className="mt-1 text-sm font-bold text-sky-400">↑ {fmtRate(netRates.sent)}</p>
          <p className="text-sm font-bold text-emerald-400">↓ {fmtRate(netRates.recv)}</p>
          <p className="mt-1 text-xs text-app-muted">모니터링 {elapsedStr} 경과</p>
        </article>
      </div>

      {/* ── CPU 사용률 차트 ── */}
      <article className="rounded-xl border border-app-border bg-app-soft p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">CPU 사용률 추이</h3>
          <span className="text-xs text-app-muted">
            {cpuHistory.length > 0 &&
              `최소 ${Math.min(...cpuHistory).toFixed(1)}% · 최대 ${Math.max(...cpuHistory).toFixed(1)}% · 평균 ${(cpuHistory.reduce((a, b) => a + b, 0) / cpuHistory.length).toFixed(1)}%`}
          </span>
        </div>
        <Sparkline points={cpuHistory} color="#38bdf8" />
      </article>

      {/* ── CPU 온도 차트 ── */}
      <article className="rounded-xl border border-app-border bg-app-soft p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">CPU 온도 추이</h3>
          <span className="text-xs text-app-muted">
            {tempHistory.length > 0 &&
              `최소 ${Math.min(...tempHistory).toFixed(1)}°C · 최대 ${Math.max(...tempHistory).toFixed(1)}°C`}
          </span>
        </div>
        <Sparkline
          points={tempHistory}
          color={
            (hw?.cpu_temp ?? 0) > 85 ? '#f87171' :
            (hw?.cpu_temp ?? 0) > 70 ? '#fbbf24' : '#34d399'
          }
        />
        <div className="mt-2 flex gap-4 text-xs text-app-muted">
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />정상 &lt;55°C</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-yellow-300" />주의 55~70°C</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-amber-400" />경고 70~85°C</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-rose-400" />위험 &gt;85°C</span>
        </div>
      </article>

      {/* ── 메모리 상세 ── */}
      <article className="rounded-xl border border-app-border bg-app-soft p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">메모리</h3>
          <span className="text-xs text-app-muted">
            {mem ? `전체 ${fmtBytes(mem.total)}` : ''}
          </span>
        </div>
        {mem ? (
          <>
            <UsageBar percent={mem.percent} color={barColor(mem.percent)} />
            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
              {([
                ['Used',      mem.used,      'text-rose-400'],
                ['Cached',    mem.cached,    'text-amber-300'],
                ['Free',      mem.free,      'text-emerald-400'],
                ['Available', mem.available, 'text-sky-400'],
              ] as [string, number, string][]).map(([label, val, cls]) => (
                <div key={label}>
                  <p className="text-xs text-app-muted">{label}</p>
                  <p className={`font-semibold ${cls}`}>{fmtBytes(val)}</p>
                </div>
              ))}
            </div>
            <div className="mt-3">
              <Sparkline points={memHistory} color="#a78bfa" />
            </div>
          </>
        ) : (
          <p className="text-xs text-app-muted">-</p>
        )}
      </article>

      {/* ── 디스크 ── */}
      <article className="rounded-xl border border-app-border bg-app-soft p-4">
        <h3 className="mb-3 text-sm font-semibold">디스크</h3>
        <div className="space-y-3">
          {disks.length === 0 && <p className="text-xs text-app-muted">-</p>}
          {disks.map((d) => (
            <div key={d.mountpoint}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-mono text-app-text">{d.mountpoint}</span>
                <span className="text-app-muted">
                  {fmtBytes(d.used)} / {d.total > 0 ? fmtBytes(d.total) : '-'}
                  {d.total > 0 && ` (${d.percent.toFixed(1)}%)`}
                </span>
              </div>
              {d.total > 0 ? (
                <UsageBar percent={d.percent} color={barColor(d.percent)} />
              ) : (
                <p className="text-xs text-app-muted">스왑 없음</p>
              )}
            </div>
          ))}
        </div>
      </article>

      {/* ── 배터리 ── */}
      <article className="rounded-xl border border-app-border bg-app-soft p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">배터리</h3>
          <span className="text-xs text-app-muted">
            충전 제한 {hw?.battery_limit != null ? `${hw.battery_limit}%` : '-'}
          </span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-app-border">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              (hw?.battery_capacity ?? 0) > 60 ? 'bg-emerald-500' :
              (hw?.battery_capacity ?? 0) > 30 ? 'bg-amber-400' : 'bg-rose-500'
            }`}
            style={{ width: `${hw?.battery_capacity ?? 0}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-xs text-app-muted">
          <span>잔량 <strong className="text-app-text">{hw?.battery_capacity != null ? `${hw.battery_capacity}%` : '-'}</strong></span>
          {hw?.battery_limit != null && (
            <span>제한선 <strong className="text-app-text">{hw.battery_limit}%</strong></span>
          )}
        </div>
      </article>
    </section>
  );
}
