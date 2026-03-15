import type { Channel, Recording } from './types';
import {
  fmtDateRange, fmtDuration, fmtFileSize, fmtRelative,
  normalizeUploadStatus, uploadBadgeClass,
} from './chzzkUtils';

interface HealthState {
  healthy: boolean;
  scanner_running?: boolean;
  disk_free_bytes?: number | null;
  disk_used_percent?: number | null;
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
}

export default function ChzzkOverviewTab({
  health, channels, activeChannelCount, activeUploads, recordings,
  retryingRecordingId, deletingRecordingId, onRetryUpload, onDeleteRecording,
}: Props) {
  return (
    <section className="space-y-5">
      <div className="grid gap-4 md:grid-cols-4">
        <article className="rounded-xl border border-app-border bg-app-soft p-4">
          <p className="text-xs text-app-muted">System Health</p>
          <p className={`mt-2 text-lg font-semibold ${health?.healthy ? 'text-emerald-400' : 'text-rose-400'}`}>
            {health?.healthy ? 'Healthy' : 'Unhealthy'}
          </p>
        </article>
        <article className="rounded-xl border border-app-border bg-app-soft p-4">
          <p className="text-xs text-app-muted">Scanner</p>
          <p className="mt-2 text-lg font-semibold">{health?.scanner_running ? 'Running' : 'Stopped'}</p>
        </article>
        <article className="rounded-xl border border-app-border bg-app-soft p-4">
          <p className="text-xs text-app-muted">Channels</p>
          <p className="mt-2 text-lg font-semibold">{activeChannelCount}/{channels.length} Active</p>
        </article>
        <article className="rounded-xl border border-app-border bg-app-soft p-4">
          <p className="text-xs text-app-muted">Uploads</p>
          <p className="mt-2 text-lg font-semibold">{activeUploads} Active</p>
        </article>
        <article className="rounded-xl border border-app-border bg-app-soft p-4">
          <p className="text-xs text-app-muted">Disk Free</p>
          <p className={`mt-2 text-lg font-semibold ${
            health?.disk_used_percent != null && health.disk_used_percent > 90 ? 'text-rose-400' :
            health?.disk_used_percent != null && health.disk_used_percent > 75 ? 'text-amber-400' : ''
          }`}>
            {health?.disk_free_bytes != null ? fmtFileSize(health.disk_free_bytes) : '-'}
            {health?.disk_used_percent != null && (
              <span className="ml-1 text-sm text-app-muted">({health.disk_used_percent}% 사용)</span>
            )}
          </p>
        </article>
      </div>

      <article className="rounded-xl border border-app-border bg-app-soft p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Recording History</h3>
          <p className="text-xs text-app-muted">최근 {recordings.length}건</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead>
              <tr className="border-b border-app-border text-xs text-app-muted">
                <th className="px-3 py-2 font-medium">채널명</th>
                <th className="px-3 py-2 font-medium">스트림 제목</th>
                <th className="px-3 py-2 font-medium">녹화 시작~종료</th>
                <th className="px-3 py-2 font-medium">재생 시간</th>
                <th className="px-3 py-2 font-medium">파일 크기</th>
                <th className="px-3 py-2 font-medium">업로드 상태</th>
                <th className="px-3 py-2 font-medium">관리</th>
              </tr>
            </thead>
            <tbody>
              {recordings.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-sm text-app-muted">녹화 이력이 없습니다.</td></tr>
              ) : recordings.map((item) => {
                const uploadStatus = item.upload_status ? normalizeUploadStatus(item.upload_status) : null;
                return (
                  <tr key={item.id} className="border-b border-app-border/70 last:border-b-0">
                    <td className="px-3 py-3">
                      <p className="truncate font-medium">{item.display_name || '-'}</p>
                      <p className="text-xs text-app-muted">#{item.id}</p>
                    </td>
                    <td className="px-3 py-3">{item.title || '-'}</td>
                    <td className="px-3 py-3">
                      <p>{fmtDateRange(item.started_at, item.ended_at)}</p>
                      <p className="text-xs text-app-muted">{fmtRelative(item.started_at)}</p>
                    </td>
                    <td className="px-3 py-3">{fmtDuration(item.duration_seconds)}</td>
                    <td className="px-3 py-3">{fmtFileSize(item.file_size_bytes)}</td>
                    <td className="px-3 py-3">
                      {uploadStatus ? (
                        <span className={`rounded-full px-2 py-1 text-xs font-medium ${uploadBadgeClass(uploadStatus)}`}>{uploadStatus}</span>
                      ) : (
                        <span className="text-xs text-app-muted">-</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        {uploadStatus === 'failed' ? (
                          <button
                            className="rounded-lg border border-rose-500/40 px-2 py-1 text-xs text-rose-300 hover:bg-rose-500/10 disabled:opacity-60"
                            onClick={() => onRetryUpload(item.id)}
                            disabled={retryingRecordingId === item.id}
                          >
                            {retryingRecordingId === item.id ? 'Retrying...' : 'Retry'}
                          </button>
                        ) : (
                          <span className="text-xs text-app-muted">-</span>
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
}

