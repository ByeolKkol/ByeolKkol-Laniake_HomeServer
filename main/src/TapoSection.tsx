import { useCallback, useEffect, useMemo, useState } from 'react';
import { HistoryChart } from './Charts';
import {
  fetchMonthly, fetchRates, saveRates,
  type ElectricityRate, type MonthlyUsage,
} from './electricityApi';
import {
  deleteTapoDevice, fetchTapoDevices, fetchTapoHistory,
  setTapoDeviceIp, syncTapoDevices, turnOff, turnOn,
  type TapoDevice, type TapoDeviceHistory,
} from './tapoApi';

// ── helpers ───────────────────────────────────────────────────────────────────
const fmtW   = (v: number | null): string => (v != null ? `${v.toFixed(1)}W` : '-');
const fmtWh  = (v: number | null): string => (v != null ? `${v.toFixed(0)}Wh` : '-');
const fmtAgo = (ts: number | null): string => {
  if (ts == null) return '-';
  const s = Math.floor(Date.now() / 1000 - ts);
  if (s < 60) return `${s}초 전`;
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  return `${Math.floor(s / 3600)}시간 전`;
};

// ── preset ranges ─────────────────────────────────────────────────────────────
interface RangePreset { label: string; minutes: number }
const PRESETS: RangePreset[] = [
  { label: '30분', minutes: 30 },
  { label: '1시간', minutes: 60 },
  { label: '6시간', minutes: 360 },
  { label: '24시간', minutes: 1440 },
  { label: '7일', minutes: 10080 },
];

// ── sub-components ────────────────────────────────────────────────────────────
interface PlugCardProps {
  device: TapoDevice;
  selected: boolean;
  toggling: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onSetIp: (ip: string) => void;
}
const PlugCard = ({ device, selected, toggling, onSelect, onDelete, onToggle, onSetIp }: PlugCardProps): JSX.Element => {
  const [ipInput, setIpInput] = useState(device.ip ?? '');
  const noIp = !device.ip;

  return (
    <article
      onClick={onSelect}
      className={`cursor-pointer rounded-xl border p-4 transition ${selected
        ? 'border-brand bg-brand/10'
        : 'border-app-border bg-app-soft hover:border-brand/40'}`}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">{device.name}</p>
          {device.model && <p className="text-[10px] text-app-muted">{device.model}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            disabled={toggling || noIp}
            className={`rounded-full border px-3 py-0.5 text-xs font-medium transition ${
              device.is_on
                ? 'border-emerald-500/60 bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
                : 'border-app-border bg-app-border/30 text-app-muted hover:border-brand/40'
            } disabled:opacity-40`}>
            {toggling ? '...' : device.is_on ? 'ON' : 'OFF'}
          </button>
          <button onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="text-xs text-app-muted hover:text-rose-400">✕</button>
        </div>
      </div>

      {noIp ? (
        <div onClick={(e) => e.stopPropagation()} className="mb-2 flex gap-1">
          <input
            value={ipInput}
            onChange={(e) => setIpInput(e.target.value)}
            placeholder="192.168.1.x"
            className="flex-1 rounded-lg border border-app-border bg-app-soft px-2 py-1 text-xs text-app-text placeholder:text-app-muted focus:border-brand focus:outline-none"
          />
          <button
            onClick={() => { if (ipInput) onSetIp(ipInput); }}
            disabled={!ipInput}
            className="rounded-lg border border-brand bg-brand/20 px-2 py-1 text-xs hover:bg-brand/30 disabled:opacity-40">
            저장
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-app-border/30 px-2 py-1.5 text-center">
              <p className="text-[10px] text-app-muted">현재 전력</p>
              <p className="text-base font-bold text-amber-400">{fmtW(device.power_w)}</p>
            </div>
            <div className="rounded-lg bg-app-border/30 px-2 py-1.5 text-center">
              <p className="text-[10px] text-app-muted">오늘 사용</p>
              <p className="text-base font-bold text-sky-400">{fmtWh(device.today_energy_wh)}</p>
            </div>
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-app-muted">
            <span>이번 달: {fmtWh(device.month_energy_wh)}</span>
            <span>{fmtAgo(device.last_seen)}</span>
          </div>
        </>
      )}
    </article>
  );
};

// ── RateEditor ────────────────────────────────────────────────────────────────
const RateEditor = ({ onSaved }: { onSaved: () => void }): JSX.Element => {
  const [rates, setRates] = useState<ElectricityRate[]>([]);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetchRates().then(setRates).catch(() => undefined);
  }, []);

  const update = (i: number, field: keyof ElectricityRate, val: string): void => {
    setRates((prev) => prev.map((r, idx) =>
      idx === i ? { ...r, [field]: field === 'limit_kwh' ? (val === '' ? null : Number(val)) : Number(val) } : r
    ));
  };

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    try {
      await saveRates(rates);
      onSaved();
      setOpen(false);
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  return (
    <div className="rounded-xl border border-app-border bg-app-soft">
      <button onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium">
        <span>전기요금 누진세 설정</span>
        <span className="text-app-muted">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="border-t border-app-border px-4 pb-4 pt-3">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-app-muted">
                <th className="pb-2 text-left">구간</th>
                <th className="pb-2 text-center">상한 (kWh)</th>
                <th className="pb-2 text-center">기본요금 (원)</th>
                <th className="pb-2 text-center">단가 (원/kWh)</th>
              </tr>
            </thead>
            <tbody className="space-y-1">
              {rates.map((r, i) => (
                <tr key={r.tier}>
                  <td className="py-1 pr-2 text-app-muted">{r.tier}구간</td>
                  <td className="py-1 px-1">
                    <input type="number" value={r.limit_kwh ?? ''} placeholder="무제한"
                      onChange={(e) => update(i, 'limit_kwh', e.target.value)}
                      className="w-full rounded border border-app-border bg-app-soft px-2 py-0.5 text-center text-app-text focus:border-brand focus:outline-none" />
                  </td>
                  <td className="py-1 px-1">
                    <input type="number" value={r.base_won}
                      onChange={(e) => update(i, 'base_won', e.target.value)}
                      className="w-full rounded border border-app-border bg-app-soft px-2 py-0.5 text-center text-app-text focus:border-brand focus:outline-none" />
                  </td>
                  <td className="py-1 pl-1">
                    <input type="number" step="0.1" value={r.rate_won}
                      onChange={(e) => update(i, 'rate_won', e.target.value)}
                      className="w-full rounded border border-app-border bg-app-soft px-2 py-0.5 text-center text-app-text focus:border-brand focus:outline-none" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[10px] text-app-muted">※ 마지막 구간 상한은 비워두면 무제한으로 적용됩니다.</p>
          <button onClick={() => void handleSave()} disabled={saving}
            className="mt-3 rounded-lg border border-brand bg-brand/20 px-4 py-1.5 text-xs font-medium hover:bg-brand/30 disabled:opacity-40">
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      )}
    </div>
  );
};

// ── MonthlySection ─────────────────────────────────────────────────────────────
const fmtWon = (v: number): string => v.toLocaleString('ko-KR') + '원';
const fmtKwh = (v: number): string => v.toFixed(1) + ' kWh';

const MonthlySection = (): JSX.Element => {
  const [data, setData] = useState<MonthlyUsage[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [rateKey, setRateKey] = useState(0);

  const load = useCallback((): void => {
    fetchMonthly(6).then(setData).catch(() => undefined);
  }, []);

  useEffect(() => { load(); }, [load, rateKey]);

  return (
    <div className="space-y-2">
      {data.length === 0 && (
        <p className="text-xs text-app-muted">월별 데이터가 아직 없습니다. 데이터가 쌓이면 자동으로 표시됩니다.</p>
      )}
      {data.map((m) => (
        <article key={m.month} className="rounded-xl border border-app-border bg-app-soft overflow-hidden">
          <button onClick={() => setExpanded(expanded === m.month ? null : m.month)}
            className="flex w-full items-center justify-between px-4 py-3">
            <span className="text-sm font-semibold">{m.month}</span>
            <div className="flex items-center gap-4 text-right">
              <div>
                <p className="text-[10px] text-app-muted">사용량</p>
                <p className="text-sm font-bold text-sky-400">{fmtKwh(m.total_kwh)}</p>
              </div>
              <div>
                <p className="text-[10px] text-app-muted">예상 요금</p>
                <p className="text-sm font-bold text-amber-400">{fmtWon(m.estimated_won)}</p>
              </div>
              <span className="text-app-muted text-xs">{expanded === m.month ? '▲' : '▼'}</span>
            </div>
          </button>
          {expanded === m.month && (
            <div className="border-t border-app-border px-4 pb-3 pt-2">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-app-muted">
                    <th className="pb-1 text-left">기기</th>
                    <th className="pb-1 text-right">사용량</th>
                  </tr>
                </thead>
                <tbody>
                  {m.devices.map((d) => (
                    <tr key={d.device_id} className="border-t border-app-border/40">
                      <td className="py-1">{d.name}</td>
                      <td className="py-1 text-right text-sky-400">{fmtKwh(d.kwh)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>
      ))}
      <RateEditor onSaved={() => setRateKey((k) => k + 1)} />
    </div>
  );
};

// ── main component ────────────────────────────────────────────────────────────
const TapoSection = (): JSX.Element => {
  const [devices, setDevices]           = useState<TapoDevice[]>([]);
  const [selectedId, setSelectedId]     = useState<number | null>(null);
  const [history, setHistory]           = useState<TapoDeviceHistory | null>(null);
  const [rangeMinutes, setRangeMinutes] = useState<number>(60);
  const [toggling, setToggling]         = useState<number | null>(null);
  const [syncing, setSyncing]           = useState(false);
  const [error, setError]               = useState('');

  const loadDevices = useCallback(async (): Promise<void> => {
    try { setDevices(await fetchTapoDevices()); }
    catch (e) { setError((e as Error).message); }
  }, []);

  useEffect(() => { void loadDevices(); }, [loadDevices]);

  useEffect(() => {
    const id = window.setInterval(() => void loadDevices(), 5000);
    return () => window.clearInterval(id);
  }, [loadDevices]);

  useEffect(() => {
    if (selectedId == null) return;
    const id = window.setInterval(() => {
      fetchTapoHistory(selectedId, { minutes: rangeMinutes }).then(setHistory).catch(() => undefined);
    }, 30000);
    return () => window.clearInterval(id);
  }, [selectedId, rangeMinutes]);

  useEffect(() => {
    if (selectedId == null) return;
    fetchTapoHistory(selectedId, { minutes: rangeMinutes }).then(setHistory).catch(() => undefined);
  }, [selectedId, rangeMinutes]);

  const handleSync = useCallback(async (): Promise<void> => {
    setSyncing(true);
    try {
      await syncTapoDevices();
      await loadDevices();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSyncing(false);
    }
  }, [loadDevices]);

  const handleDelete = useCallback(async (id: number): Promise<void> => {
    try {
      await deleteTapoDevice(id);
      if (selectedId === id) setSelectedId(null);
      await loadDevices();
    } catch (e) { setError((e as Error).message); }
  }, [loadDevices, selectedId]);

  const handleSetIp = useCallback(async (id: number, ip: string): Promise<void> => {
    try {
      await setTapoDeviceIp(id, ip);
      await loadDevices();
    } catch (e) { setError((e as Error).message); }
  }, [loadDevices]);

  const handleToggle = useCallback(async (device: TapoDevice): Promise<void> => {
    setToggling(device.id);
    try {
      if (device.is_on) await turnOff(device.id);
      else await turnOn(device.id);
      await loadDevices();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setToggling(null);
    }
  }, [loadDevices]);

  const powerPoints = useMemo(() => history?.points.map((p) => p.power_w) ?? [], [history]);
  const timestamps  = useMemo(() => history?.points.map((p) => p.ts) ?? [], [history]);
  const selectedDevice = devices.find((d) => d.id === selectedId) ?? null;

  const deviceSummary = useMemo(() => ({
    totalW:  devices.reduce((s, d) => s + (d.power_w ?? 0), 0),
    totalWh: devices.reduce((s, d) => s + (d.today_energy_wh ?? 0), 0),
  }), [devices]);

  const powerStats = useMemo(() => {
    if (powerPoints.length === 0 || !history) return null;
    const last = history.points[history.points.length - 1];
    return {
      avg:          (powerPoints.reduce((a, b) => a + b, 0) / powerPoints.length).toFixed(1),
      max:          Math.max(...powerPoints).toFixed(1),
      todayEnergyWh: last.today_energy_wh,
    };
  }, [powerPoints, history]);

  return (
    <section className="space-y-4">
      {error && (
        <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {error}
          <button onClick={() => setError('')} className="ml-2 text-xs underline">닫기</button>
        </p>
      )}

      {/* Sync button */}
      <div className="flex items-center gap-3">
        <p className="text-xs text-app-muted">Tapo 계정의 기기를 자동으로 불러옵니다.</p>
        <button
          onClick={() => void handleSync()}
          disabled={syncing}
          className="ml-auto rounded-lg border border-brand bg-brand/20 px-3 py-1.5 text-xs font-medium hover:bg-brand/30 disabled:opacity-40">
          {syncing ? '동기화 중...' : '클라우드 동기화'}
        </button>
      </div>

      {/* Summary bar */}
      {devices.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-app-border bg-app-soft px-4 py-3 text-center">
            <p className="text-[11px] text-app-muted">현재 총 사용 전력</p>
            <p className="text-2xl font-bold text-amber-400">{deviceSummary.totalW.toFixed(1)}<span className="ml-1 text-sm font-normal text-app-muted">W</span></p>
          </div>
          <div className="rounded-xl border border-app-border bg-app-soft px-4 py-3 text-center">
            <p className="text-[11px] text-app-muted">오늘 총 사용량</p>
            <p className="text-2xl font-bold text-sky-400">{deviceSummary.totalWh.toFixed(0)}<span className="ml-1 text-sm font-normal text-app-muted">Wh</span></p>
          </div>
        </div>
      )}

      {/* Plug cards grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {devices.length === 0 && (
          <p className="col-span-full text-sm text-app-muted">
            기기가 없습니다. "클라우드 동기화"를 눌러 Tapo 계정의 기기를 불러오세요.
          </p>
        )}
        {devices.map((d) => (
          <PlugCard key={d.id} device={d}
            selected={selectedId === d.id}
            toggling={toggling === d.id}
            onSelect={() => setSelectedId(d.id === selectedId ? null : d.id)}
            onDelete={() => void handleDelete(d.id)}
            onToggle={() => void handleToggle(d)}
            onSetIp={(ip) => void handleSetIp(d.id, ip)} />
        ))}
      </div>

      {/* Monthly usage + rate settings */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-app-muted">월별 전력 사용량 및 요금</p>
        <MonthlySection />
      </div>

      {/* History detail */}
      {selectedDevice && (
        <article className="rounded-xl border border-app-border bg-app-soft p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">{selectedDevice.name} 전력 이력</p>
            <div className="flex flex-wrap gap-1">
              {PRESETS.map((p) => (
                <button key={p.minutes}
                  onClick={() => setRangeMinutes(p.minutes)}
                  className={`rounded-lg border px-2.5 py-0.5 text-xs transition ${
                    rangeMinutes === p.minutes
                      ? 'border-brand bg-brand/20 text-app-text'
                      : 'border-transparent text-app-muted hover:border-app-border'}`}>
                  {p.label}
                </button>
              ))}
            </div>
            <span className="ml-auto text-[10px] text-app-muted">
              {history ? `${history.points.length}포인트` : '로딩 중...'}
            </span>
          </div>

          <p className="mb-1 text-xs font-medium">전력 (W)</p>
          <HistoryChart points={powerPoints} color="#fbbf24"
            yMin={0} yMax={Math.max(100, ...(powerPoints.length ? powerPoints : [100]))}
            unit="W" timestamps={timestamps} />

          {powerStats && (
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[10px] text-app-muted">
              <div><p>평균 전력</p><p className="font-semibold text-app-text">{powerStats.avg}W</p></div>
              <div><p>최대 전력</p><p className="font-semibold text-app-text">{powerStats.max}W</p></div>
              <div><p>오늘 누적</p><p className="font-semibold text-app-text">{fmtWh(powerStats.todayEnergyWh)}</p></div>
            </div>
          )}
        </article>
      )}
    </section>
  );
};

export default TapoSection;
