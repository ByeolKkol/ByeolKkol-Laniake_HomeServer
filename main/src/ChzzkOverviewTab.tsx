import { useState } from 'react';
import type { Channel, Recording } from './types';
import {
  fmtDateRange, fmtDuration, fmtFileSize, fmtRelative,
  normalizeUploadStatus, uploadBadgeClass,
} from './chzzkUtils';
import { GaugeRing, PulseDot, UsageBar, fmtBytes, usageColorCls, usageColorHex } from './Charts';

interface HealthState {
  healthy: boolean;
  scanner_running?: boolean;
  disk_free_bytes?: number | null;
  disk_used_percent?: number | null;
  disk_total_bytes?: number | null;
}

interface Props {
  health: HealthState | null;
  channels: Channel[];
  activeChannelCount: number;
  activeUploads: number;
  recordings: Recording[];
  retryingRecordingId: number | null;
  deletingRecordingId: number | null;
  onRetryUpload: (id: number) => void;
  onDeleteRecording: (id: number) => void;
  onBulkDelete: (ids: number[]) => void;
}

interface StatusItem {
  key: string;
  label: string;
  colorCls: string;
}

interface StatusBreakdownProps {
  recordings: Recording[];
}

const STATUS_ITEMS: StatusItem[] = [
  { key: 'completed', label: '완료',   colorCls: 'bg-emerald-500' },
  { key: 'recording', label: '녹화중', colorCls: 'bg-sky-500' },
  { key: 'failed',    label: '실패',   colorCls: 'bg-rose-500' },
  { key: 'cancelled', label: '취소',   colorCls: 'bg-gray-500' },
];

/** 녹화 상태별 분포 바 */
const StatusBreakdown = ({ recordings }: StatusBreakdownProps): JSX.Element | null => {
  const counts = recordings.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
  const total = recordings.length || 1;
  const items = STATUS_ITEMS.filter((i) => counts[i.key]);

  if (items.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {items.map(({ key, label, colorCls }) => (
        <div key={key} className="flex items-center gap-2 text-xs">
          <span className="w-10 shrink-0 text-app-muted">{label}</span>
          <div className="flex-1">
            <UsageBar percent={((counts[key] ?? 0) / total) * 100} colorCls={colorCls} />
          </div>
          <span className="w-8 shrink-0 text-right font-mono text-app-text">{counts[key] ?? 0}건</span>
        </div>
      ))}
    </div>
  );
};

const TABLE_HEADERS = ['채널명', '스트림 제목', '녹화 시작~종료', '재생시간', '파일 크기', '업로드', '관리'];

export const ChzzkOverviewTab = ({
  health, channels, activeChannelCount, activeUploads, recordings,
  retryingRecordingId, deletingRecordingId, onRetryUpload, onDeleteRecording, onBulkDelete,
}: Props): JSX.Element => {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const diskPct   = health?.disk_used_percent ?? 0;
  const diskTotal = health?.disk_total_bytes ?? null;
  const channelPct = channels.length > 0 ? (activeChannelCount / channels.length) * 100 : 0;

  const deletableRecordings = recordings.filter((r) => r.status !== 'recording');
  const allSelected = deletableRecordings.length > 0 && selectedIds.size === deletableRecordings.length;

  const toggleAll = (): void => {
    setSelectedIds(allSelected ? new Set() : new Set(deletableRecordings.map((r) => r.id)));
  };

  const toggle = (id: number): void => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBulkDelete = (): void => {
    onBulkDelete([...selectedIds]);
    setSelectedIds(new Set());
  };

  return (
    <section className="space-y-5">

      {/* ── 상태 카드 ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-xl border border-app-border bg-app-soft p-4">
          <p className="mb-2 text-xs text-app-muted">System Health</p>
          <div className="flex items-center gap-2">
            <PulseDot active={health?.healthy ?? false}
              colorCls={health?.healthy ? 'bg-emerald-500' : 'bg-rose-500'} />
            <span className={`text-lg font-semibold ${health?.healthy ? 'text-emerald-400' : 'text-rose-400'}`}>
              {health == null ? '-' : health.healthy ? 'Healthy' : 'Unhealthy'}
            </span>
          </div>
        </article>

        <article className="rounded-xl border border-app-border bg-app-soft p-4">
          <p className="mb-2 text-xs text-app-muted">Scanner</p>
          <div className="flex items-center gap-2">
            <PulseDot active={health?.scanner_running ?? false} colorCls="bg-sky-500" />
            <span className="text-lg font-semibold">
              {health?.scanner_running ? 'Running' : 'Stopped'}
            </span>
          </div>
        </article>

        <article className="rounded-xl border border-app-border bg-app-soft p-4">
          <p className="mb-2 text-xs text-app-muted">채널</p>
          <p className="text-2xl font-bold">
            <span className="text-emerald-400">{activeChannelCount}</span>
            <span className="text-base font-normal text-app-muted"> / {channels.length} Active</span>
          </p>
          <div className="mt-2">
            <UsageBar percent={channelPct} colorCls="bg-emerald-500" />
          </div>
        </article>

        <article className="rounded-xl border border-app-border bg-app-soft p-4">
          <p className="mb-2 text-xs text-app-muted">업로드</p>
          <div className="flex items-center gap-2">
            <PulseDot active={activeUploads > 0} colorCls="bg-amber-400" />
            <span className="text-2xl font-bold">{activeUploads}</span>
            <span className="text-sm text-app-muted">진행중</span>
          </div>
        </article>
      </div>

      {/* ── 디스크 + 녹화 현황 ── */}
      <div className="grid gap-3 lg:grid-cols-2">
        <article className="rounded-xl border border-app-border bg-app-soft p-4">
          <h3 className="mb-3 text-sm font-semibold">녹화 디스크</h3>
          <div className="flex items-center gap-5">
            <GaugeRing value={diskPct} color={usageColorHex(diskPct)} size={80}
              label={`${diskPct.toFixed(0)}%`} sublabel="사용" />
            <div className="flex-1 space-y-2">
              <UsageBar percent={diskPct} colorCls={usageColorCls(diskPct)} />
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded bg-app-border/30 px-2 py-1.5">
                  <p className="text-app-muted">여유</p>
                  <p className="font-semibold text-emerald-400">
                    {health?.disk_free_bytes != null ? fmtBytes(health.disk_free_bytes) : '-'}
                  </p>
                </div>
                <div className="rounded bg-app-border/30 px-2 py-1.5">
                  <p className="text-app-muted">전체</p>
                  <p className="font-semibold">{diskTotal != null ? fmtBytes(diskTotal) : '-'}</p>
                </div>
              </div>
            </div>
          </div>
        </article>

        <article className="rounded-xl border border-app-border bg-app-soft p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">녹화 현황</h3>
            <span className="text-xs text-app-muted">최근 {recordings.length}건</span>
          </div>
          <StatusBreakdown recordings={recordings} />
          {recordings.length === 0 && (
            <p className="text-xs text-app-muted">녹화 이력이 없습니다.</p>
          )}
        </article>
      </div>

      {/* ── 녹화 이력 테이블 ── */}
      <article className="rounded-xl border border-app-border bg-app-soft p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Recording History</h3>
          {selectedIds.size > 0 && (
            <button
              className="rounded-lg border border-rose-500/40 px-3 py-1.5 text-sm text-rose-300 hover:bg-rose-500/10"
              onClick={handleBulkDelete}
            >
              {selectedIds.size}개 삭제
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead>
              <tr className="border-b border-app-border text-xs text-app-muted">
                <th className="px-3 py-2">
                  {deletableRecordings.length > 0 && (
                    <input type="checkbox" checked={allSelected} onChange={toggleAll}
                      className="h-3.5 w-3.5 accent-brand" />
                  )}
                </th>
                {TABLE_HEADERS.map((h) => (
                  <th key={h} className="px-3 py-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recordings.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-sm text-app-muted">
                    녹화 이력이 없습니다.
                  </td>
                </tr>
              ) : recordings.map((item) => {
                const active = item.status === 'recording';
                const checked = selectedIds.has(item.id);
                const uploadStatus = item.upload_status
                  ? normalizeUploadStatus(item.upload_status)
                  : null;
                return (
                  <tr key={item.id}
                    className={`border-b border-app-border/70 transition-colors last:border-b-0 hover:bg-app-border/10 ${
                      checked ? 'bg-brand/5' : ''
                    }`}>
                    <td className="px-3 py-3">
                      <input type="checkbox" checked={checked} disabled={active}
                        onChange={() => toggle(item.id)}
                        className="h-3.5 w-3.5 accent-brand disabled:opacity-30 cursor-pointer" />
                    </td>
                    <td className="px-3 py-3">
                      <p className="truncate font-medium">{item.display_name ?? '-'}</p>
                      <p className="text-xs text-app-muted">#{item.id}</p>
                    </td>
                    <td className="max-w-[200px] truncate px-3 py-3">{item.title ?? '-'}</td>
                    <td className="px-3 py-3">
                      <p className="text-xs">{fmtDateRange(item.started_at, item.ended_at)}</p>
                      <p className="text-xs text-app-muted">{fmtRelative(item.started_at)}</p>
                    </td>
                    <td className="px-3 py-3 text-xs">{fmtDuration(item.duration_seconds)}</td>
                    <td className="px-3 py-3 font-mono text-xs">{fmtFileSize(item.file_size_bytes)}</td>
                    <td className="px-3 py-3">
                      {uploadStatus
                        ? <span className={`rounded-full px-2 py-1 text-xs font-medium ${uploadBadgeClass(uploadStatus)}`}>{uploadStatus}</span>
                        : <span className="text-xs text-app-muted">-</span>}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        {uploadStatus === 'failed' && (
                          <button
                            className="rounded-lg border border-rose-500/40 px-2 py-1 text-xs text-rose-300 hover:bg-rose-500/10 disabled:opacity-60"
                            onClick={() => onRetryUpload(item.id)}
                            disabled={retryingRecordingId === item.id}
                          >
                            {retryingRecordingId === item.id ? 'Retrying...' : 'Retry'}
                          </button>
                        )}
                        <button
                          className="rounded-lg border border-rose-500/40 px-2 py-1 text-xs text-rose-300 hover:bg-rose-500/10 disabled:opacity-60"
                          onClick={() => onDeleteRecording(item.id)}
                          disabled={deletingRecordingId === item.id}
                        >
                          {deletingRecordingId === item.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
};

export default ChzzkOverviewTab;
