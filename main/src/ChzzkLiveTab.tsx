import type { Recording } from './types';
import { fmtElapsed, FALLBACK_THUMBNAIL } from './chzzkUtils';
import { buildThumbnailProxyUrl } from './api';

interface HealthState {
  scanner_running?: boolean;
}

interface Props {
  health: HealthState | null;
  activeRecordings: Recording[];
  stoppingRecordingId: number | null;
  onStopRecording: (id: number) => void;
}

export default function ChzzkLiveTab({ health, activeRecordings, stoppingRecordingId, onStopRecording }: Props) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between rounded-lg border border-app-border bg-app-soft px-3 py-2 text-xs">
        <span className="text-app-muted">Scanner status</span>
        <span className={health?.scanner_running ? 'text-emerald-300' : 'text-rose-300'}>
          {health?.scanner_running ? 'Running' : 'Stopped'}
        </span>
      </div>
      <p className="mb-2 text-xs text-app-muted">Current active recordings update every 5 seconds.</p>
      <div className="grid gap-2">
        {activeRecordings.length === 0 ? (
          <p className="text-sm text-app-muted">No active recordings.</p>
        ) : activeRecordings.map((item) => (
          <article key={item.id} className="rounded-lg border border-app-border bg-app-soft p-2">
            <div className="flex items-start gap-2">
              <div className="flex-shrink-0">
                <img
                  src={item.thumbnail_url ? `${buildThumbnailProxyUrl(item.thumbnail_url)}&t=${Date.now()}` : FALLBACK_THUMBNAIL}
                  alt={item.title || `Recording #${item.id}`}
                  className="h-20 w-32 rounded-md object-cover"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  crossOrigin="anonymous"
                  onError={(e) => { e.currentTarget.src = FALLBACK_THUMBNAIL; }}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-xs font-semibold">
                    [{item.display_name || 'Unknown'}] - {item.title || `Recording #${item.id}`}
                  </p>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    <span className="rounded-full bg-emerald-500/20 px-2 py-1 text-xs text-emerald-300">{item.status}</span>
                    <button
                      className="rounded-lg border border-rose-500/40 px-2 py-1 text-xs text-rose-300 hover:bg-rose-500/10 disabled:opacity-60"
                      onClick={() => onStopRecording(item.id)}
                      disabled={stoppingRecordingId === item.id}
                    >
                      {stoppingRecordingId === item.id ? 'Stopping...' : 'Stop'}
                    </button>
                  </div>
                </div>
                <p className="text-xs text-app-muted">
                  Elapsed: {fmtElapsed(item.started_at)} · Quality: {item.quality || '-'} · Stream ID: {item.stream_id || '-'}
                </p>
                <p className="truncate text-xs text-app-muted">Output: {item.file_path || '(pending)'}</p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
