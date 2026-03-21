import { useCallback, useEffect, useMemo, useState } from 'react';
import { HistoryChart } from './Charts';
import {
  addIotDevice, deleteIotDevice, fetchIotDevices, fetchIotHistory,
  type IotDevice, type IotDeviceHistory,
} from './iotApi';

// ── helpers ───────────────────────────────────────────────────────────────────
const fmtTemp = (v: number | null): string => (v != null ? `${v.toFixed(1)}°C` : '-');
const fmtHum  = (v: number | null): string => (v != null ? `${v.toFixed(1)}%` : '-');
const fmtMv   = (v: number | null): string => (v != null ? `${v}mV` : '-');
const fmtAgo  = (ts: number | null): string => {
  if (ts == null) return '-';
  const s = Math.floor(Date.now() / 1000 - ts);
  if (s < 60) return `${s}초 전`;
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  return `${Math.floor(s / 3600)}시간 전`;
};
const tempColor = (t: number | null): string => {
  if (t == null) return '#6b7280';
  if (t < 18) return '#38bdf8';
  if (t < 26) return '#34d399';
  if (t < 30) return '#fbbf24';
  return '#f87171';
};

// ── preset ranges ─────────────────────────────────────────────────────────────
interface RangePreset { label: string; minutes: number }
const PRESETS: RangePreset[] = [
  { label: '5분',  minutes: 5 },
  { label: '30분', minutes: 30 },
  { label: '1시간', minutes: 60 },
  { label: '6시간', minutes: 360 },
  { label: '24시간', minutes: 1440 },
  { label: '7일',  minutes: 10080 },
  { label: '30일', minutes: 43200 },
];

// ── date util ─────────────────────────────────────────────────────────────────
const toDateInput = (ts: number): string => new Date(ts * 1000).toISOString().slice(0, 10);
const fromDateInput = (s: string, end: boolean): number => {
  const d = new Date(s);
  if (end) d.setHours(23, 59, 59, 999);
  return d.getTime() / 1000;
};

// ── sub-components ────────────────────────────────────────────────────────────
interface AddFormProps { onAdd: (name: string, mac: string) => void }
const AddForm = ({ onAdd }: AddFormProps): JSX.Element => {
  const [name, setName] = useState('');
  const [mac, setMac]   = useState('');
  const submit = (): void => {
    if (!name.trim() || !mac.trim()) return;
    onAdd(name.trim(), mac.trim());
    setName(''); setMac('');
  };
  return (
    <div className="flex flex-wrap gap-2">
      <input value={name} onChange={(e) => setName(e.target.value)}
        placeholder="이름 (예: 거실)"
        className="flex-1 min-w-32 rounded-lg border border-app-border bg-app-soft px-3 py-1.5 text-sm outline-none focus:border-brand" />
      <input value={mac} onChange={(e) => setMac(e.target.value)}
        placeholder="MAC (예: aa:bb:cc:dd:ee:ff)"
        className="flex-1 min-w-40 rounded-lg border border-app-border bg-app-soft px-3 py-1.5 font-mono text-sm outline-none focus:border-brand" />
      <button onClick={submit}
        className="rounded-lg border border-brand bg-brand/20 px-4 py-1.5 text-sm font-medium hover:bg-brand/30">
        + 추가
      </button>
    </div>
  );
};

interface SensorCardProps {
  device: IotDevice;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}
const SensorCard = ({ device, selected, onSelect, onDelete }: SensorCardProps): JSX.Element => (
  <article
    onClick={onSelect}
    className={`cursor-pointer rounded-xl border p-4 transition ${selected
      ? 'border-brand bg-brand/10'
      : 'border-app-border bg-app-soft hover:border-brand/40'}`}>
    <div className="mb-2 flex items-start justify-between gap-2">
      <div>
        <p className="text-sm font-semibold">{device.name}</p>
      </div>
      <button onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="text-xs text-app-muted hover:text-rose-400">✕</button>
    </div>
    <div className="grid grid-cols-2 gap-2">
      <div className="rounded-lg bg-app-border/30 px-2 py-1.5 text-center">
        <p className="text-[10px] text-app-muted">온도</p>
        <p className="text-base font-bold" style={{ color: tempColor(device.temperature) }}>
          {fmtTemp(device.temperature)}
        </p>
      </div>
      <div className="rounded-lg bg-app-border/30 px-2 py-1.5 text-center">
        <p className="text-[10px] text-app-muted">습도</p>
        <p className="text-base font-bold text-sky-400">{fmtHum(device.humidity)}</p>
      </div>
    </div>
    <div className="mt-2 flex justify-between text-[10px] text-app-muted">
      <span>배터리: {fmtMv(device.battery_mv)} · {device.battery_pct ?? '-'}%</span>
      <span>{device.rssi != null ? `${device.rssi}dBm · ` : ''}{fmtAgo(device.last_seen)}</span>
    </div>
  </article>
);

// ── main component ────────────────────────────────────────────────────────────
const IotTab = (): JSX.Element => {
  const [devices, setDevices]         = useState<IotDevice[]>([]);
  const [selectedId, setSelectedId]   = useState<number | null>(null);
  const [history, setHistory]         = useState<IotDeviceHistory | null>(null);
  const [rangeMinutes, setRangeMinutes] = useState<number>(60);
  const [useCustom, setUseCustom]     = useState(false);
  const [startDate, setStartDate]     = useState(() => toDateInput(Date.now() / 1000 - 7 * 86400));
  const [endDate, setEndDate]         = useState(() => toDateInput(Date.now() / 1000));
  const [error, setError]             = useState('');

  const loadDevices = useCallback(async (): Promise<void> => {
    try { setDevices(await fetchIotDevices()); }
    catch (e) { setError((e as Error).message); }
  }, []);

  useEffect(() => { void loadDevices(); }, [loadDevices]);

  // Auto-refresh device list (current values) every 30s
  useEffect(() => {
    const id = window.setInterval(() => void loadDevices(), 30000);
    return () => window.clearInterval(id);
  }, [loadDevices]);

  // Auto-refresh history every 30s
  useEffect(() => {
    if (selectedId == null) return;
    const id = window.setInterval(() => {
      const params = useCustom
        ? { start_ts: fromDateInput(startDate, false), end_ts: fromDateInput(endDate, true) }
        : { minutes: rangeMinutes };
      fetchIotHistory(selectedId, params).then(setHistory).catch(() => undefined);
    }, 30000);
    return () => window.clearInterval(id);
  }, [selectedId, rangeMinutes, useCustom, startDate, endDate]);

  // Load history when selection / range changes
  useEffect(() => {
    if (selectedId == null) return;
    const params = useCustom
      ? { start_ts: fromDateInput(startDate, false), end_ts: fromDateInput(endDate, true) }
      : { minutes: rangeMinutes };
    fetchIotHistory(selectedId, params)
      .then(setHistory)
      .catch(() => undefined);
  }, [selectedId, rangeMinutes, useCustom, startDate, endDate]);

  const handleAdd = useCallback(async (name: string, mac: string): Promise<void> => {
    try {
      await addIotDevice(name, mac);
      await loadDevices();
    } catch (e) { setError((e as Error).message); }
  }, [loadDevices]);

  const handleDelete = useCallback(async (id: number): Promise<void> => {
    try {
      await deleteIotDevice(id);
      if (selectedId === id) setSelectedId(null);
      await loadDevices();
    } catch (e) { setError((e as Error).message); }
  }, [loadDevices, selectedId]);

  const tempPoints  = useMemo(() => history?.points.map((p) => p.temperature) ?? [], [history]);
  const humPoints   = useMemo(() => history?.points.map((p) => p.humidity) ?? [], [history]);
  const timestamps  = useMemo(() => history?.points.map((p) => p.ts) ?? [], [history]);

  const historyStats = useMemo(() => {
    if (tempPoints.length === 0) return null;
    const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
    return {
      tempAvg: (sum(tempPoints) / tempPoints.length).toFixed(1),
      tempMax: Math.max(...tempPoints).toFixed(1),
      humAvg:  (sum(humPoints) / humPoints.length).toFixed(1),
      humMax:  Math.max(...humPoints).toFixed(1),
    };
  }, [tempPoints, humPoints]);

  const selectedDevice = devices.find((d) => d.id === selectedId) ?? null;

  return (
    <section className="space-y-4">
      {error && (
        <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {error}
        </p>
      )}

      {/* Add sensor */}
      <div className="rounded-xl border border-app-border bg-app-soft p-4">
        <p className="mb-2 text-xs font-medium text-app-muted">센서 추가</p>
        <AddForm onAdd={(n, m) => void handleAdd(n, m)} />
      </div>

      {/* Sensor cards grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {devices.length === 0 && (
          <p className="col-span-full text-sm text-app-muted">등록된 센서가 없습니다.</p>
        )}
        {devices.map((d) => (
          <SensorCard key={d.id} device={d}
            selected={selectedId === d.id}
            onSelect={() => setSelectedId(d.id === selectedId ? null : d.id)}
            onDelete={() => void handleDelete(d.id)} />
        ))}
      </div>

      {/* History detail */}
      {selectedDevice && (
        <article className="rounded-xl border border-app-border bg-app-soft p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">{selectedDevice.name} 이력</p>

            {/* Preset buttons */}
            <div className="flex flex-wrap gap-1">
              {PRESETS.map((p) => (
                <button key={p.minutes}
                  onClick={() => { setUseCustom(false); setRangeMinutes(p.minutes); }}
                  className={`rounded-lg border px-2.5 py-0.5 text-xs transition ${
                    !useCustom && rangeMinutes === p.minutes
                      ? 'border-brand bg-brand/20 text-app-text'
                      : 'border-transparent text-app-muted hover:border-app-border'}`}>
                  {p.label}
                </button>
              ))}
              <button onClick={() => setUseCustom(true)}
                className={`rounded-lg border px-2.5 py-0.5 text-xs transition ${
                  useCustom
                    ? 'border-brand bg-brand/20 text-app-text'
                    : 'border-transparent text-app-muted hover:border-app-border'}`}>
                날짜 선택
              </button>
            </div>

            {/* Custom date range */}
            {useCustom && (
              <div className="flex flex-wrap items-center gap-2">
                <input type="date" value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="rounded-lg border border-app-border bg-app px-2 py-0.5 text-xs" />
                <span className="text-xs text-app-muted">~</span>
                <input type="date" value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="rounded-lg border border-app-border bg-app px-2 py-0.5 text-xs" />
              </div>
            )}

            <span className="ml-auto text-[10px] text-app-muted">
              {history ? `${history.points.length}포인트` : '로딩 중...'}
            </span>
          </div>

          {/* Temperature chart */}
          <p className="mb-1 text-xs font-medium">온도 (°C)</p>
          <HistoryChart points={tempPoints} color={tempColor(selectedDevice.temperature)}
            yMin={-10} yMax={50} unit="°C" timestamps={timestamps} />

          {/* Humidity chart */}
          <p className="mb-1 mt-3 text-xs font-medium">습도 (%)</p>
          <HistoryChart points={humPoints} color="#38bdf8"
            yMin={0} yMax={100} unit="%" timestamps={timestamps} />

          {/* Stats */}
          {historyStats && (
            <div className="mt-3 grid grid-cols-4 gap-2 text-center text-[10px] text-app-muted">
              <div><p>온도 평균</p><p className="font-semibold text-app-text">{historyStats.tempAvg}°C</p></div>
              <div><p>온도 최대</p><p className="font-semibold text-app-text">{historyStats.tempMax}°C</p></div>
              <div><p>습도 평균</p><p className="font-semibold text-app-text">{historyStats.humAvg}%</p></div>
              <div><p>습도 최대</p><p className="font-semibold text-app-text">{historyStats.humMax}%</p></div>
            </div>
          )}
        </article>
      )}
    </section>
  );
};

export default IotTab;
