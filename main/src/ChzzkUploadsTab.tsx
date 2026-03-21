import { useMemo, useState } from 'react';
import type { Recording, UploadLog } from './types';

interface Props {
  uploads: UploadLog[];
  recordings: Recording[];
  onBulkDelete: (ids: number[]) => void;
}

interface StatusStyle {
  bg: string;
  text: string;
}

const statusStyle = (status: string): StatusStyle => {
  if (status === 'completed') return { bg: 'bg-emerald-500/20', text: 'text-emerald-300' };
  if (status === 'failed')    return { bg: 'bg-rose-500/20',    text: 'text-rose-300' };
  return                             { bg: 'bg-amber-500/20',   text: 'text-amber-300' };
};

const isActiveUpload = (status: string): boolean =>
  status === 'uploading' || status === 'in_progress';

export const ChzzkUploadsTab = ({ uploads, recordings, onBulkDelete }: Props): JSX.Element => {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const recordingMap = useMemo(() => new Map(recordings.map((r) => [r.id, r])), [recordings]);

  const deletableUploads = uploads.filter((u) => !isActiveUpload(u.status));
  const allSelected = deletableUploads.length > 0 && selectedIds.size === deletableUploads.length;

  const toggleAll = (): void => {
    setSelectedIds(allSelected ? new Set() : new Set(deletableUploads.map((u) => u.id)));
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
    <section>
      {/* ── 툴바 ── */}
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-app-muted">Google Drive uploads update every 5 seconds.</p>
        {selectedIds.size > 0 && (
          <button
            className="rounded-lg border border-rose-500/40 px-3 py-1.5 text-sm text-rose-300 hover:bg-rose-500/10"
            onClick={handleBulkDelete}
          >
            {selectedIds.size}개 삭제
          </button>
        )}
      </div>

      {/* ── 전체선택 ── */}
      {deletableUploads.length > 0 && (
        <label className="mb-2 flex cursor-pointer items-center gap-2 text-xs text-app-muted select-none">
          <input type="checkbox" checked={allSelected} onChange={toggleAll}
            className="h-3.5 w-3.5 accent-brand" />
          전체 선택 ({deletableUploads.length}개)
        </label>
      )}

      <div className="grid gap-3">
        {uploads.length === 0 ? (
          <p className="text-sm text-app-muted">No uploads yet.</p>
        ) : uploads.map((item) => {
          const rec = recordingMap.get(item.recording_id);
          const { bg, text } = statusStyle(item.status);
          const active = isActiveUpload(item.status);
          const checked = selectedIds.has(item.id);

          return (
            <article key={item.id}
              className={`rounded-xl border bg-app-soft p-4 transition-colors ${
                checked ? 'border-brand/60 bg-brand/5' : 'border-app-border'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-start gap-3">
                  <input type="checkbox" checked={checked} disabled={active}
                    onChange={() => toggle(item.id)}
                    className="mt-1 h-3.5 w-3.5 accent-brand disabled:opacity-30 cursor-pointer" />
                  <div>
                    <p className="text-sm font-medium">
                      {rec?.display_name ?? `Recording #${item.recording_id}`}
                    </p>
                    {rec?.title && (
                      <p className="mt-0.5 max-w-[480px] truncate text-xs text-app-muted">{rec.title}</p>
                    )}
                  </div>
                </div>
                <span className={`rounded-full px-2 py-1 text-xs ${bg} ${text}`}>
                  {item.status}
                </span>
              </div>
              <div className="mt-2 space-y-1 pl-6">
                <p className="text-xs text-app-muted">Progress: {item.progress_percent ?? 0}%</p>
                <p className="truncate text-xs text-app-muted">Message: {item.message ?? '-'}</p>
                <p className="text-xs text-app-muted">
                  Updated: {item.updated_at ? new Date(item.updated_at).toLocaleString() : '-'}
                </p>
              </div>
              {item.drive_file_url && (
                <a className="mt-2 inline-block pl-6 text-xs text-brand hover:underline"
                  href={item.drive_file_url} target="_blank" rel="noreferrer">
                  Open in Google Drive
                </a>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
};

export default ChzzkUploadsTab;
