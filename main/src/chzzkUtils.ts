// CHZZK 탭 공통 유틸리티 함수

export function fmtElapsed(startedAt: string | null): string {
  if (!startedAt) return '-';
  const diff = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  return h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
}

export function fmtDateTime(value: string | null): string {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

export function fmtDateRange(startedAt: string | null, endedAt: string | null): string {
  if (!startedAt && !endedAt) return '-';
  if (startedAt && endedAt) return `${fmtDateTime(startedAt)} ~ ${fmtDateTime(endedAt)}`;
  if (startedAt) return `${fmtDateTime(startedAt)} ~ 진행 중`;
  return `- ~ ${fmtDateTime(endedAt)}`;
}

export function fmtRelative(value: string | null): string {
  if (!value) return '';
  const now = Date.now();
  const target = new Date(value).getTime();
  const diffSec = Math.round((target - now) / 1000);
  const absSec = Math.abs(diffSec);
  const rtf = new Intl.RelativeTimeFormat('ko', { numeric: 'auto' });
  if (absSec < 60) return rtf.format(diffSec, 'second');
  if (absSec < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (absSec < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour');
  return rtf.format(Math.round(diffSec / 86400), 'day');
}

export function fmtDuration(seconds: number | null): string {
  if (!seconds) return '-';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`;
}

export function fmtFileSize(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return '-';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = bytes / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 100 ? 0 : size >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

export function normalizeUploadStatus(status: string | null | undefined): string {
  return (status || 'pending').toLowerCase();
}

export function uploadBadgeClass(status: string): string {
  if (status === 'completed') return 'bg-emerald-500/20 text-emerald-300';
  if (status === 'uploading') return 'bg-sky-500/20 text-sky-300';
  if (status === 'failed') return 'bg-rose-500/20 text-rose-300';
  if (status === 'pending' || status === 'preserved') return 'bg-amber-500/20 text-amber-300';
  return 'bg-app-soft text-app-muted';
}

export const QUALITY_OPTIONS = ['best', '1080p', '720p', '480p', '360p'] as const;

export const FALLBACK_THUMBNAIL =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"><rect width="320" height="180" fill="%23222631"/><text x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" fill="%2398a2b3" font-family="sans-serif" font-size="16">No thumbnail</text></svg>';
