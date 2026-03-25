import { useState } from 'react';
import { fetchGoogleDriveAuthUrl, submitGoogleDriveAuthCode } from './api';
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
  onDriveStatusRefresh: () => void;
}

export default function ChzzkAccountTab({
  globalCookieStatus, googleDriveStatus, savingCookies, savingDriveCredentials,
  onSaveCookies, onUploadDriveCredentials, onDriveStatusRefresh,
}: Props) {
  const [nidAut, setNidAut] = useState('');
  const [nidSes, setNidSes] = useState('');
  const [driveFile, setDriveFile] = useState<File | null>(null);
  const [oauthCode, setOauthCode] = useState('');
  const [oauthLoading, setOauthLoading] = useState(false);
  const [oauthError, setOauthError] = useState('');
  const [oauthSuccess, setOauthSuccess] = useState('');

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

  const handleOpenAuthUrl = async () => {
    setOauthError('');
    setOauthSuccess('');
    setOauthLoading(true);
    try {
      const { auth_url } = await fetchGoogleDriveAuthUrl();
      window.open(auth_url, '_blank');
    } catch (e) {
      setOauthError((e as Error).message);
    } finally {
      setOauthLoading(false);
    }
  };

  const handleSubmitCode = async () => {
    if (!oauthCode.trim()) return;
    setOauthError('');
    setOauthSuccess('');
    setOauthLoading(true);
    try {
      await submitGoogleDriveAuthCode(oauthCode.trim());
      setOauthCode('');
      setOauthSuccess('인증 완료!');
      onDriveStatusRefresh();
    } catch (e) {
      setOauthError((e as Error).message);
    } finally {
      setOauthLoading(false);
    }
  };

  const needsOAuth = googleDriveStatus.credentials_exists
    && !googleDriveStatus.connected
    && googleDriveStatus.credential_type === 'oauth_client';

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
          <p>OAuth session: {googleDriveStatus.session_exists ? 'Present' : 'Missing'}</p>
          <p>Detail: {googleDriveStatus.detail}</p>
        </div>
      </article>

      {needsOAuth && (
        <article className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <h3 className="text-sm font-medium text-amber-300">Google OAuth 인증</h3>
          <p className="mt-1 text-xs text-app-muted">
            1. 아래 버튼으로 구글 인증 페이지를 엽니다.<br />
            2. 구글 계정 로그인 후 "허용"을 누릅니다.<br />
            3. 표시된 인증 코드를 복사해서 아래에 붙여넣고 "인증 완료"를 누릅니다.
          </p>
          <div className="mt-3 space-y-2">
            <button
              onClick={() => void handleOpenAuthUrl()}
              disabled={oauthLoading}
              className="w-full rounded-lg border border-amber-500/40 bg-amber-500/20 px-3 py-2 text-sm font-medium text-amber-300 hover:bg-amber-500/30 disabled:opacity-50">
              {oauthLoading ? '로딩 중...' : '1. Google 인증 페이지 열기'}
            </button>
            <input
              value={oauthCode}
              onChange={(e) => setOauthCode(e.target.value)}
              placeholder="인증 코드 붙여넣기"
              className="w-full rounded-lg border border-app-border bg-panel px-3 py-2 text-sm outline-none focus:border-brand" />
            <button
              onClick={() => void handleSubmitCode()}
              disabled={oauthLoading || !oauthCode.trim()}
              className="w-full rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-60">
              {oauthLoading ? '처리 중...' : '2. 인증 완료'}
            </button>
            {oauthError && <p className="text-xs text-rose-400">{oauthError}</p>}
            {oauthSuccess && <p className="text-xs text-emerald-400">{oauthSuccess}</p>}
          </div>
        </article>
      )}
    </section>
  );
}
