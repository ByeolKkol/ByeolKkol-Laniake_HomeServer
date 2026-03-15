import { useState } from 'react';
import {
  getServerIp, setServerIp,
  getApiBase, getServerApiBase, getWolApiBase,
  getDiscussionHost, setDiscussionHost, getDiscussionWsBase,
} from './settingsStore';

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
