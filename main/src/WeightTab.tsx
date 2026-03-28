import { useCallback, useEffect, useMemo, useState } from 'react';
import { WEIGHT_RANGE_PRESETS, lastNDaysRange, type WeightRangeKey } from './Charts';
import { fetchWeightHistory, fetchLatestWeight, deleteWeightRecord, type WeightRecord } from './healthApi';
import { WeightCompositionSection } from './WeightCompositionSection';
import { WeightChartsSection } from './WeightChartsSection';

const fmtDate = (ts: number): string =>
  new Date(ts * 1000).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
const fmtKg = (v: number | null): string => (v != null ? `${v.toFixed(1)}kg` : '-');
const fmtPct = (v: number | null): string => (v != null ? `${v.toFixed(1)}%` : '-');
const fmtInt = (v: number | null): string => (v != null ? String(v) : '-');

const WeightTab = (): JSX.Element => {
  const [records, setRecords] = useState<WeightRecord[]>([]);
  const [latest, setLatest]   = useState<WeightRecord | null>(null);
  const [rangeKey, setRangeKey] = useState<WeightRangeKey>('30d');
  const [error, setError]     = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fixedRange = useMemo(
    () => lastNDaysRange(WEIGHT_RANGE_PRESETS.find((p) => p.key === rangeKey)!.days),
    [rangeKey],
  );

  const load = useCallback(async (): Promise<void> => {
    try {
      const [recs, lat] = await Promise.all([
        fetchWeightHistory({ start_ts: fixedRange.startTs, end_ts: fixedRange.endTs }),
        fetchLatestWeight().catch(() => null),
      ]);
      setRecords(recs);
      setLatest(lat);
    } catch (e) { setError((e as Error).message); }
  }, [fixedRange]);

  useEffect(() => { void load(); }, [load]);

  const handleDelete = useCallback(async (id: number): Promise<void> => {
    setDeletingId(id);
    try {
      await deleteWeightRecord(id);
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setDeletingId(null); }
  }, [load]);

  if (error) {
    return (
      <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
        {error}
      </p>
    );
  }

  return (
    <section className="space-y-4">
      {latest && (
        <div className="space-y-3">
          <div className="rounded-xl border border-app-border bg-app-soft p-4">
            <p className="mb-3 text-xs font-medium text-app-muted">최신 측정 — {fmtDate(latest.ts)}</p>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: '체중',     value: fmtKg(latest.weight_kg),    color: '#60a5fa' },
                { label: 'BMI',      value: fmtInt(latest.bmi),          color: '#a78bfa' },
                { label: '체지방률', value: fmtPct(latest.body_fat_pct), color: '#f87171' },
                { label: '근육량',   value: fmtKg(latest.muscle_kg),     color: '#34d399' },
                { label: '골량',     value: fmtKg(latest.bone_kg),       color: '#fbbf24' },
                { label: '내장지방', value: fmtInt(latest.visceral_fat), color: '#fb923c' },
                { label: '수분율',   value: fmtPct(latest.water_pct),    color: '#38bdf8' },
                { label: '기초대사', value: latest.bmr_kcal != null ? `${latest.bmr_kcal}kcal` : '-', color: '#e879f9' },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-center justify-between rounded-lg bg-app-border/30 px-3 py-2">
                  <span className="text-[11px] text-app-muted">{label}</span>
                  <span className="text-sm font-bold" style={{ color }}>{value}</span>
                </div>
              ))}
            </div>
          </div>
          <WeightCompositionSection r={latest} />
        </div>
      )}

      {/* 공통 범위 선택기 */}
      <div className="flex items-center gap-2">
        <p className="text-xs text-app-muted">기간</p>
        <div className="flex gap-1">
          {WEIGHT_RANGE_PRESETS.map((p) => (
            <button key={p.key}
              onClick={() => setRangeKey(p.key)}
              className={`rounded-lg border px-2.5 py-0.5 text-xs transition ${
                rangeKey === p.key
                  ? 'border-brand bg-brand/20 text-app-text'
                  : 'border-transparent text-app-muted hover:border-app-border'}`}>
              {p.label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-[10px] text-app-muted">{records.length}건</span>
      </div>

      {records.length === 0 ? (
        <p className="rounded-xl border border-app-border bg-app-soft py-8 text-center text-sm text-app-muted">
          체중 기록 없음 (체중계 연동 후 자동 수집)
        </p>
      ) : (
        <WeightChartsSection records={records} fixedRange={fixedRange} />
      )}

      {records.length > 0 && (
        <div className="rounded-xl border border-app-border bg-app-soft p-4">
          <p className="mb-2 text-xs font-medium text-app-muted">측정 기록</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-app-border text-app-muted">
                  <th className="py-1 text-left">날짜</th>
                  <th className="py-1 text-right">체중</th>
                  <th className="py-1 text-right">BMI</th>
                  <th className="py-1 text-right">체지방</th>
                  <th className="py-1 text-right">근육량</th>
                  <th className="py-1 text-right">출처</th>
                  <th className="py-1" />
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id} className="border-b border-app-border/40">
                    <td className="py-1">{fmtDate(r.ts)}</td>
                    <td className="py-1 text-right font-medium text-blue-400">{fmtKg(r.weight_kg)}</td>
                    <td className="py-1 text-right">{fmtInt(r.bmi)}</td>
                    <td className="py-1 text-right">{fmtPct(r.body_fat_pct)}</td>
                    <td className="py-1 text-right">{fmtKg(r.muscle_kg)}</td>
                    <td className="py-1 text-right text-app-muted">{r.source}</td>
                    <td className="py-1 pl-2 text-right">
                      <button
                        onClick={() => { void handleDelete(r.id); }}
                        disabled={deletingId === r.id}
                        className="rounded px-1.5 py-0.5 text-[10px] text-rose-400 hover:bg-rose-500/20 disabled:opacity-40">
                        {deletingId === r.id ? '…' : '삭제'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
};

export default WeightTab;
