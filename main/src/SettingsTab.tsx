import { useEffect, useState } from 'react';
import { fetchTapoCredentials, saveTapoCredentials } from './tapoApi';
import {
  getServerIp, setServerIp,
  getApiBase, getServerApiBase, getWolApiBase,
  getDiscussionHost, setDiscussionHost, getDiscussionWsBase,
} from './settingsStore';

function TapoCredentialsCard(): JSX.Element {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [hasPassword, setHasPassword] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    fetchTapoCredentials()
      .then((c) => { setUsername(c.username); setHasPassword(c.has_password); })
      .catch((e) => console.warn('fetchTapoCredentials failed:', e));
  }, []);

  const handleSave = async (): Promise<void> => {
    if (!username || !password) return;
    setStatus('saving');
    try {
      await saveTapoCredentials(username, password);
      setHasPassword(true);
      setPassword('');
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2000);
    } catch {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 2000);
    }
  };

  return (
    <article className="rounded-xl border border-app-border bg-app-soft p-4">
      <h3 className="text-sm font-medium">Tapo 계정</h3>
      <p className="mt-1 text-xs text-app-muted">
        Tapo 스마트 플러그 클라우드 동기화에 사용되는 계정입니다.
      </p>
      <div className="mt-3 space-y-2">
        <input
          type="email"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="이메일"
          className="w-full rounded-lg border border-app-border bg-panel px-3 py-2 text-sm text-app-text outline-none focus:border-brand placeholder:text-app-muted"
        />
        <div className="flex gap-2">
          <input
            type={showPw ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={hasPassword ? '새 비밀번호 입력 (변경 시에만)' : '비밀번호'}
            className="flex-1 rounded-lg border border-app-border bg-panel px-3 py-2 text-sm text-app-text outline-none focus:border-brand placeholder:text-app-muted"
          />
          <button
            onClick={() => setShowPw((v) => !v)}
            className="rounded-lg border border-app-border px-3 text-xs text-app-muted hover:text-app-text">
            {showPw ? '숨김' : '표시'}
          </button>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={() => void handleSave()}
          disabled={!username || !password || status === 'saving'}
          className="rounded-lg border border-brand bg-brand/20 px-4 py-1.5 text-xs font-medium hover:bg-brand/30 disabled:opacity-40">
          {status === 'saving' ? '저장 중...' : status === 'saved' ? '저장됨 ✓' : '저장'}
        </button>
        {status === 'error' && <p className="text-xs text-rose-400">저장 실패</p>}
        {hasPassword && status === 'idle' && (
          <p className="text-xs text-app-muted">비밀번호 설정됨</p>
        )}
      </div>
    </article>
  );
}

export default function SettingsTab() {
  const [ip, setIp] = useState(getServerIp());
  const [discussionHost, setDiscussionHostState] = useState(getDiscussionHost());
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    const trimmedIp = ip.trim();
    const trimmedHost = discussionHost.trim();
    if (!trimmedIp) return;
    setServerIp(trimmedIp);
    if (trimmedHost) setDiscussionHost(trimmedHost);
    setSaved(true);
    setTimeout(() => window.location.reload(), 800);
  };

  return (
    <section className="max-w-xl space-y-4">
      <article className="rounded-xl border border-app-border bg-app-soft p-4">
        <h3 className="text-sm font-medium">서버 IP 설정</h3>
        <p className="mt-1 text-xs text-app-muted">
          모든 백엔드 API의 서버 IP를 변경합니다. 저장 후 페이지가 자동으로 새로고침됩니다.
        </p>
        <div className="mt-3 space-y-2">
          <input
            value={ip}
            onChange={(e) => { setIp(e.target.value); setSaved(false); }}
            className="w-full rounded-lg border border-app-border bg-panel px-3 py-2 text-sm outline-none focus:border-brand"
            placeholder="예: 192.168.1.89"
          />
        </div>
      </article>

      <article className="rounded-xl border border-app-border bg-app-soft p-4">
        <h3 className="text-sm font-medium">AI 토론 서비스 호스트</h3>
        <p className="mt-1 text-xs text-app-muted">
          MacBook에서 실행 중인 AI 토론 백엔드 주소 (host:port)
        </p>
        <div className="mt-3 space-y-2">
          <input
            value={discussionHost}
            onChange={(e) => { setDiscussionHostState(e.target.value); setSaved(false); }}
            className="w-full rounded-lg border border-app-border bg-panel px-3 py-2 text-sm outline-none focus:border-brand"
            placeholder="예: localhost:8092"
          />
        </div>
      </article>

      <button
        className="w-full rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
        onClick={handleSave}
        disabled={saved}
      >
        {saved ? '저장됨 — 새로고침 중...' : '저장'}
      </button>

      <TapoCredentialsCard />

      <article className="rounded-xl border border-app-border bg-app-soft p-4">
        <h3 className="mb-2 text-sm font-medium">현재 API 엔드포인트</h3>
        <div className="space-y-1 text-xs text-app-muted">
          <p>CHZZK 백엔드: <span className="text-app-text">{getApiBase()}</span></p>
          <p>서버 컨트롤: <span className="text-app-text">{getServerApiBase()}</span></p>
          <p>WOL 서비스: <span className="text-app-text">{getWolApiBase()}</span></p>
          <p>AI 토론 WS: <span className="text-app-text">{getDiscussionWsBase()}</span></p>
        </div>
      </article>
    </section>
  );
}
