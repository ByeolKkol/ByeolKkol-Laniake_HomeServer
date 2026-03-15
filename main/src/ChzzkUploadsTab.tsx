import type { UploadLog } from './types';

interface Props {
  uploads: UploadLog[];
}

export default function ChzzkUploadsTab({ uploads }: Props) {
  return (
    <section>
      <p className="mb-3 text-sm text-app-muted">Google Drive uploads update every 5 seconds.</p>
      <div className="grid gap-3">
        {uploads.length === 0 ? (
          <p className="text-sm text-app-muted">No uploads yet.</p>
        ) : uploads.map((item) => (
          <article key={item.id} className="rounded-xl border border-app-border bg-app-soft p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">Recording #{item.recording_id}</p>
              <span className={`rounded-full px-2 py-1 text-xs ${
                item.status === 'completed' ? 'bg-emerald-500/20 text-emerald-300' :
                item.status === 'failed' ? 'bg-rose-500/20 text-rose-300' :
                'bg-amber-500/20 text-amber-300'
              }`}>
                {item.status}
              </span>
            </div>
            <p className="mt-2 text-xs text-app-muted">Progress: {item.progress_percent ?? 0}%</p>
            <p className="mt-1 truncate text-xs text-app-muted">Message: {item.message || '-'}</p>
            <p className="mt-1 text-xs text-app-muted">
              Updated: {item.updated_at ? new Date(item.updated_at).toLocaleString() : '-'}
            </p>
            {item.drive_file_url ? (
              <a className="mt-2 inline-block text-xs text-brand hover:underline" href={item.drive_file_url} target="_blank" rel="noreferrer">
                Open in Google Drive
              </a>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
