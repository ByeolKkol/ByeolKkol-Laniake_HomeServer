import { useState } from 'react';
import type { GoogleDriveSettings } from './types';

interface CookieStatus {
  configured: boolean;
  nid_aut_masked: string | null;
  nid_ses_masked: string | null;
  updated_at: string | null;
}

interface Props {
  globalCookieStatus: CookieStatus;
  googleDriveStatus: GoogleDriveSettings;
  savingCookies: boolean;
  savingDriveCredentials: boolean;
  onSaveCookies: (nidAut: string, nidSes: string) => void;
  onUploadDriveCredentials: (file: File) => void;
}

export default function ChzzkAccountTab({
  globalCookieStatus, googleDriveStatus, savingCookies, savingDriveCredentials,
  onSaveCookies, onUploadDriveCredentials,
}: Props) {
  const [nidAut, setNidAut] = useState('');
  const [nidSes, setNidSes] = useState('');
  const [driveFile, setDriveFile] = useState<File | null>(null);

  const handleSaveCookies = () => {
    onSaveCookies(nidAut, nidSes);
    setNidAut('');
    setNidSes('');
  };

  const handleUpload = () => {
    if (!driveFile) return;
    onUploadDriveCredentials(driveFile);
    setDriveFile(null);
  };

  return (
    <section className="max-w-2xl space-y-4">
      <article className="rounded-xl border border-app-border bg-app-soft p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium">Global Chzzk Account</h3>
          <span className={`rounded-full px-2 py-1 text-xs font-medium ${globalCookieStatus.configured ? 'bg-emerald-600/25 text-emerald-300' : 'bg-rose-600/25 text-rose-300'}`}>
            Status: {globalCookieStatus.configured ? 'Configured' : 'Missing'}
          </span>
        </div>
        <p className="mt-1 text-xs text-app-muted">Save `NID_AUT` and `NID_SES` for all channel recordings.</p>
        <div className="mt-3 space-y-2">
          <input value={nidAut} onChange={(e) => setNidAut(e.target.value)}
            className="w-full rounded-lg border border-app-border bg-panel px-3 py-2 text-sm outline-none focus:border-brand"
            placeholder="NID_AUT" />
          <input value={nidSes} onChange={(e) => setNidSes(e.target.value)}
            className="w-full rounded-lg border border-app-border bg-panel px-3 py-2 text-sm outline-none focus:border-brand"
            placeholder="NID_SES" />
          <button className="w-full rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            onClick={handleSaveCookies} disabled={savingCookies}>
            {savingCookies ? 'Saving...' : 'Save Global Account'}
          </button>
        </div>
      </article>

      <article className="rounded-xl border border-app-border bg-app-soft p-4">
        <h3 className="text-sm font-medium">Current Global Cookie Status</h3>
        <div className="mt-2 space-y-1 text-xs text-app-muted">
          <p>NID_AUT: {globalCookieStatus.nid_aut_masked ?? 'Missing'}</p>
          <p>NID_SES: {globalCookieStatus.nid_ses_masked ?? 'Missing'}</p>
          <p>Updated: {globalCookieStatus.updated_at ? new Date(globalCookieStatus.updated_at).toLocaleString() : '-'}</p>
        </div>
      </article>

      <article className="rounded-xl border border-app-border bg-app-soft p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium">Google Drive Setup</h3>
          <span className={`rounded-full px-2 py-1 text-xs font-medium ${googleDriveStatus.connected ? 'bg-emerald-600/25 text-emerald-300' : 'bg-amber-600/25 text-amber-300'}`}>
            Status: {googleDriveStatus.connected ? 'Connected' : 'Needs Setup'}
          </span>
        </div>
        <p className="mt-1 text-xs text-app-muted">Upload the `credentials.json` from Google Cloud Console.</p>
        <div className="mt-3 space-y-2">
          <input type="file" accept=".json,application/json"
            className="w-full rounded-lg border border-app-border bg-panel px-3 py-2 text-sm outline-none focus:border-brand"
            onChange={(e) => setDriveFile(e.target.files?.[0] ?? null)} />
          <button className="w-full rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            onClick={handleUpload} disabled={savingDriveCredentials || !driveFile}>
            {savingDriveCredentials ? 'Uploading...' : 'Upload credentials.json'}
          </button>
        </div>
        <div className="mt-3 space-y-1 text-xs text-app-muted">
          <p>Connection: {googleDriveStatus.connected ? 'Connected' : 'Not connected'}</p>
          <p>Credential type: {googleDriveStatus.credential_type}</p>
          <p>credentials.json: {googleDriveStatus.credentials_exists ? 'Present' : 'Missing'}</p>
          <p>settings.yaml: {googleDriveStatus.settings_exists ? 'Present' : 'Missing'}</p>
          <p>OAuth session: {googleDriveStatus.session_exists ? 'Present' : 'Missing'}</p>
          <p>Detail: {googleDriveStatus.detail}</p>
        </div>
      </article>
    </section>
  );
}
