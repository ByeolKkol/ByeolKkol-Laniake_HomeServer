import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github-dark.css';
import { getDiscussionHost } from './settingsStore';

interface ChatMessage {
  id: number;
  sender: string;
  content: string;
  ts?: string;
  streaming?: boolean;
}

interface SystemEvent {
  id: number;
  text: string;
}

const AGENT_STYLE: Record<string, { label: string; color: string; bg: string; avatarBg: string }> = {
  user:   { label: '사용자',  color: 'text-app-text',     bg: 'border-app-border bg-app-soft',       avatarBg: 'bg-app-soft border-app-border text-app-text' },
  claude: { label: 'CLAUDE', color: 'text-sky-300',       bg: 'border-sky-500/30 bg-sky-500/10',     avatarBg: 'bg-sky-500/20 border-sky-500/40 text-sky-300' },
  gemini: { label: 'GEMINI', color: 'text-violet-300',    bg: 'border-violet-500/30 bg-violet-500/10', avatarBg: 'bg-violet-500/20 border-violet-500/40 text-violet-300' },
  codex:  { label: 'CODEX',  color: 'text-amber-300',     bg: 'border-amber-500/30 bg-amber-500/10', avatarBg: 'bg-amber-500/20 border-amber-500/40 text-amber-300' },
};

function senderStyle(name: string) {
  return AGENT_STYLE[name] ?? {
    label: name.toUpperCase(),
    color: 'text-emerald-300',
    bg: 'border-emerald-500/30 bg-emerald-500/10',
    avatarBg: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300',
  };
}

let nextId = 0;
const uid = () => ++nextId;

interface DebateState {
  active: boolean;
  round: number;
  maxTurns: number;
}

interface PromptConfig {
  common: string;
  claude: string;
  gemini: string;
  codex: string;
}


type DiscussionView = 'chat' | 'prompt-common' | 'prompt-claude' | 'prompt-gemini' | 'prompt-codex';

const PROMPT_VIEW_KEY: Record<string, keyof PromptConfig> = {
  'prompt-common': 'common',
  'prompt-claude': 'claude',
  'prompt-gemini': 'gemini',
  'prompt-codex': 'codex',
};

const PROMPT_VIEW_LABEL: Record<string, string> = {
  'prompt-common': '마스터 프롬프트 (모든 에이전트 공통)',
  'prompt-claude': 'Claude 개별 시스템 프롬프트',
  'prompt-gemini': 'Gemini 개별 시스템 프롬프트',
  'prompt-codex': 'Codex 개별 시스템 프롬프트',
};

const PROMPT_VIEW_PLACEHOLDER: Record<string, string> = {
  'prompt-common': '모든 에이전트의 시스템 프롬프트 뒤에 추가됩니다...',
  'prompt-claude': 'Claude의 기본 시스템 프롬프트를 대체합니다. 비워두면 기본값 사용.',
  'prompt-gemini': 'Gemini의 기본 시스템 프롬프트를 대체합니다. 비워두면 기본값 사용.',
  'prompt-codex': 'Codex의 기본 시스템 프롬프트를 대체합니다. 비워두면 기본값 사용.',
};

// 각 view에서 편집하는 표시 이름의 대상 sender
const PROMPT_VIEW_SENDER: Record<string, string> = {
  'prompt-common': 'user',
  'prompt-claude': 'claude',
  'prompt-gemini': 'gemini',
  'prompt-codex': 'codex',
};

const DISPLAY_NAME_DEFAULT: Record<string, string> = {
  user: '사용자',
  claude: 'CLAUDE',
  gemini: 'GEMINI',
  codex: 'CODEX',
};


export default function AiDiscussionTab({ view = 'chat' }: { view?: DiscussionView }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [events, setEvents] = useState<SystemEvent[]>([]);
  const [participants, setParticipants] = useState<string[]>([]);
  const [streamingMap, setStreamingMap] = useState<Record<string, number>>({}); // sender -> messageId
  const [input, setInput] = useState('');
  const [connected, setConnected] = useState(false);
  const [debate, setDebate] = useState<DebateState>({ active: false, round: 0, maxTurns: 10 });
  const [maxTurnsInput, setMaxTurnsInput] = useState('10');
  const [promptDraft, setPromptDraft] = useState<PromptConfig>({ common: '', claude: '', gemini: '', codex: '' });
  const [shortTermTurns, setShortTermTurns] = useState('20');
  const [promptSaving, setPromptSaving] = useState(false);
  const [displayNames, setDisplayNames] = useState<Record<string, string>>({});
  const [displayNameDraft, setDisplayNameDraft] = useState<Record<string, string>>({});
  const [avatars, setAvatars] = useState<Record<string, string>>({});
  const [avatarDraft, setAvatarDraft] = useState<Record<string, string>>({});
  const wsRef = useRef<WebSocket | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isComposingRef = useRef(false);
  const isPinnedRef = useRef(true); // 맨 아래 고정 여부

  useEffect(() => {
    connect();
    loadPrompts();
    void loadAgentConfig();
    return () => wsRef.current?.close();
  }, []);

  useEffect(() => {
    if (isPinnedRef.current && scrollContainerRef.current) {
      const el = scrollContainerRef.current;
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, events]);

  async function loadAgentConfig() {
    const host = getDiscussionHost();
    try {
      const res = await fetch(`http://${host}/agent-config`);
      const data = await res.json() as Record<string, { display_name: string; avatar_data: string }>;
      const names: Record<string, string> = {};
      const avs: Record<string, string> = {};
      for (const [key, val] of Object.entries(data)) {
        names[key] = val.display_name || DISPLAY_NAME_DEFAULT[key] || key;
        avs[key] = val.avatar_data;
      }
      setDisplayNames(names);
      setAvatars(avs);
      setDisplayNameDraft({ ...DISPLAY_NAME_DEFAULT, ...names });
      setAvatarDraft({ ...avs });
    } catch { /* 무시 */ }
  }

  async function loadPrompts() {
    const host = getDiscussionHost();
    try {
      const [promptRes, settingsRes] = await Promise.all([
        fetch(`http://${host}/prompts`),
        fetch(`http://${host}/settings`),
      ]);
      const promptData = await promptRes.json() as PromptConfig;
      setPromptDraft(promptData);
      const settingsData = await settingsRes.json() as Record<string, string>;
      if (settingsData.short_term_turns) setShortTermTurns(settingsData.short_term_turns);
    } catch { /* 무시 */ }
  }

  async function savePrompts() {
    const host = getDiscussionHost();
    const key = PROMPT_VIEW_KEY[view];
    const sender = PROMPT_VIEW_SENDER[view];
    if (!key) return;
    setPromptSaving(true);
    try {
      await fetch(`http://${host}/prompts/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: promptDraft[key] }),
      });
      // 마스터 프롬프트: 단기기억 설정 저장
      if (view === 'prompt-common') {
        await fetch(`http://${host}/settings/short_term_turns`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: shortTermTurns }),
        });
      }
      // 표시 이름 + 아바타 저장
      if (sender) {
        const display_name = displayNameDraft[sender] ?? DISPLAY_NAME_DEFAULT[sender] ?? '';
        const avatar_data = avatarDraft[sender] ?? '';
        await fetch(`http://${host}/agent-config/${sender}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ display_name, avatar_data }),
        });
        setDisplayNames((d) => ({ ...d, [sender]: display_name || DISPLAY_NAME_DEFAULT[sender] }));
        setAvatars((d) => ({ ...d, [sender]: avatar_data }));
      }
    } finally {
      setPromptSaving(false);
    }
  }

  function handleAvatarChange(sender: string, file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setAvatarDraft((d) => ({ ...d, [sender]: dataUrl }));
    };
    reader.readAsDataURL(file);
  }

  function getLabel(sender: string): string {
    return displayNames[sender] ?? DISPLAY_NAME_DEFAULT[sender] ?? sender.toUpperCase();
  }

  async function startDebate() {
    const host = getDiscussionHost();
    const maxTurns = Math.max(1, parseInt(maxTurnsInput) || 10);
    await fetch(`http://${host}/debate/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ max_turns: maxTurns }),
    });
  }

  async function stopDebate() {
    const host = getDiscussionHost();
    await fetch(`http://${host}/debate/stop`, { method: 'POST' });
  }

  async function loadHistory(host: string) {
    try {
      const res = await fetch(`http://${host}/history`);
      const data = await res.json() as { messages: { sender: string; content: string; ts: string }[] };
      setMessages(data.messages.map((m) => ({ id: uid(), sender: m.sender, content: m.content, ts: m.ts })));
    } catch {
      // 히스토리 로드 실패 시 무시하고 빈 상태로 시작
    }
  }

  function connect() {
    const host = getDiscussionHost();
    const ws = new WebSocket(`ws://${host}/ws/join/user`);

    ws.onopen = () => { setConnected(true); loadHistory(host); };
    ws.onclose = () => { setConnected(false); };
    ws.onerror = () => { setConnected(false); };

    ws.onmessage = (e: MessageEvent<string>) => {
      const data = JSON.parse(e.data) as {
        type: string;
        name?: string;
        sender?: string;
        content?: string;
        list?: string[];
        ts?: string;
      };

      if (data.type === 'debate_start') {
        const maxTurns = (data as unknown as { max_turns: number }).max_turns;
        setDebate({ active: true, round: 0, maxTurns });
        addEvent(`토론 시작 (최대 ${maxTurns}턴)`);
      }

      else if (data.type === 'debate_end') {
        const d = data as unknown as { reason: string; round: number };
        setDebate((prev) => ({ ...prev, active: false, round: d.round }));
        const reasonLabel: Record<string, string> = {
          consensus: '합의 도달',
          max_turns: '최대 턴 완료',
          user_stopped: '사용자 중단',
        };
        addEvent(`토론 종료 — ${reasonLabel[d.reason] ?? d.reason} (${d.round}라운드)`);
      }

      else if (data.type === 'participants' && data.list) {
        setParticipants(data.list);
      }

      else if (data.type === 'join' && data.name) {
        setParticipants((p) => [...new Set([...p, data.name!])]);
        addEvent(`${data.name} 입장`);
      }

      else if (data.type === 'leave' && data.name) {
        setParticipants((p) => p.filter((n) => n !== data.name));
        addEvent(`${data.name} 퇴장`);
      }

      else if (data.type === 'chunk' && data.sender && data.content) {
        const sender = data.sender;
        setStreamingMap((prev) => {
          const existingId = prev[sender];
          if (existingId !== undefined) {
            // 기존 스트리밍 메시지에 청크 추가
            setMessages((msgs) =>
              msgs.map((m) =>
                m.id === existingId ? { ...m, content: m.content + data.content } : m
              )
            );
            return prev;
          } else {
            // 새 스트리밍 메시지 생성
            const id = uid();
            setMessages((msgs) => [
              ...msgs,
              { id, sender, content: data.content!, streaming: true },
            ]);
            return { ...prev, [sender]: id };
          }
        });
      }

      else if (data.type === 'message' && data.sender && data.content !== undefined) {
        const sender = data.sender;
        // 토론 모드에서 codex 메시지 수신 시 라운드 카운터 증가
        if (sender === 'codex') {
          setDebate((prev) => prev.active ? { ...prev, round: prev.round + 1 } : prev);
        }
        setStreamingMap((prev) => {
          const existingId = prev[sender];
          if (existingId !== undefined) {
            // 스트리밍 완료 — 메시지 확정
            setMessages((msgs) =>
              msgs.map((m) =>
                m.id === existingId
                  ? { ...m, content: data.content!, streaming: false, ts: data.ts }
                  : m
              )
            );
            const next = { ...prev };
            delete next[sender];
            return next;
          } else {
            // 스트리밍 없이 바로 완성 메시지 (user 자신의 메시지 등)
            setMessages((msgs) => [
              ...msgs,
              { id: uid(), sender, content: data.content!, ts: data.ts },
            ]);
            return prev;
          }
        });
      }
    };

    wsRef.current = ws;
  }

  function addEvent(text: string) {
    setEvents((ev) => [...ev.slice(-50), { id: uid(), text }]);
  }

  function send() {
    const text = input.trim();
    if (!text || !connected) return;
    wsRef.current!.send(JSON.stringify({ type: 'message', content: text }));
    setInput('');
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !isComposingRef.current) {
      e.preventDefault();
      send();
    }
  }

  const isResponding = Object.keys(streamingMap).length > 0;

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-3">

      {/* 상태 바 */}
      <div className="flex flex-col gap-2 rounded-lg border border-app-border bg-app-soft px-3 py-2 text-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-rose-400'}`} />
            <span className="text-app-muted">{connected ? '연결됨' : '연결 끊김'}</span>
            {!connected && (
              <button className="ml-1 text-brand hover:underline" onClick={connect}>재연결</button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-app-muted">참가자:</span>
            {participants.length === 0
              ? <span className="text-app-muted">없음</span>
              : participants.map((p) => (
                <span key={p} className="flex items-center gap-1">
                  <span className={`font-semibold ${senderStyle(p).color}`}>{getLabel(p)}</span>
                  {p !== 'user' && (
                    <button
                      className="text-app-muted hover:text-rose-400 transition-colors leading-none"
                      title={`${p} 내보내기`}
                      onClick={() => wsRef.current?.send(JSON.stringify({ type: 'kick', name: p }))}
                    >✕</button>
                  )}
                </span>
              ))
            }
          </div>
        </div>

        {/* 토론 컨트롤 */}
        <div className="flex items-center gap-2 border-t border-app-border pt-2">
          {debate.active ? (
            <>
              <span className="flex items-center gap-1 text-violet-300 font-semibold">
                <span className="animate-pulse">●</span> 토론 중
              </span>
              <span className="text-app-muted">{debate.round} / {debate.maxTurns} 라운드</span>
              <button
                className="ml-auto rounded-lg bg-rose-500/20 border border-rose-500/40 px-3 py-1 text-rose-300 hover:bg-rose-500/30 transition-colors"
                onClick={stopDebate}
              >
                토론 중단
              </button>
            </>
          ) : (
            <>
              <span className="text-app-muted">자율 토론:</span>
              <span className="text-app-muted">최대</span>
              <input
                type="number"
                min={1}
                max={50}
                className="w-14 rounded border border-app-border bg-app px-2 py-0.5 text-center text-app-text outline-none focus:border-brand"
                value={maxTurnsInput}
                onChange={(e) => setMaxTurnsInput(e.target.value)}
              />
              <span className="text-app-muted">턴</span>
              <button
                className="ml-auto rounded-lg bg-violet-500/20 border border-violet-500/40 px-3 py-1 text-violet-300 hover:bg-violet-500/30 transition-colors disabled:opacity-40"
                onClick={startDebate}
                disabled={!connected || participants.length <= 1}
              >
                토론 시작
              </button>
            </>
          )}
        </div>
      </div>

      {/* 프롬프트 설정 패널 */}
      {view in PROMPT_VIEW_KEY && (() => {
        const key = PROMPT_VIEW_KEY[view];
        const sender = PROMPT_VIEW_SENDER[view];
        const defaultName = DISPLAY_NAME_DEFAULT[sender] ?? '';
        return (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-app-text">{PROMPT_VIEW_LABEL[view]}</span>
              <button
                className="rounded px-4 py-1.5 bg-brand text-white text-sm hover:opacity-80 disabled:opacity-40 transition-opacity"
                onClick={savePrompts}
                disabled={promptSaving}
              >
                {promptSaving ? '저장 중...' : '저장'}
              </button>
            </div>
            <div className="flex items-center gap-4 rounded-lg border border-app-border bg-app-soft px-3 py-3">
              {/* 아바타 미리보기 + 업로드 */}
              <div className="flex flex-col items-center gap-1.5">
                {avatarDraft[sender] ? (
                  <img src={avatarDraft[sender]} className="h-16 w-16 rounded-full object-cover border border-app-border" />
                ) : (
                  <div className={`h-16 w-16 rounded-full border flex items-center justify-center text-lg font-bold ${senderStyle(sender).avatarBg}`}>
                    {(displayNameDraft[sender] ?? defaultName).charAt(0)}
                  </div>
                )}
                <div className="flex gap-2">
                  <label className="cursor-pointer rounded border border-app-border px-2 py-0.5 text-xs text-app-muted hover:text-app-text transition-colors">
                    업로드
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/gif,image/webp"
                      className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAvatarChange(sender, f); }}
                    />
                  </label>
                  {avatarDraft[sender] && (
                    <button
                      className="rounded border border-rose-500/40 px-2 py-0.5 text-xs text-rose-400 hover:bg-rose-500/10 transition-colors"
                      onClick={() => setAvatarDraft((d) => ({ ...d, [sender]: '' }))}
                    >
                      제거
                    </button>
                  )}
                </div>
              </div>
              {/* 표시 이름 */}
              <div className="flex flex-col gap-1 flex-1">
                <label className="text-xs text-app-muted">표시 이름</label>
                <input
                  className="rounded border border-app-border bg-app px-2 py-1.5 text-sm text-app-text outline-none focus:border-brand"
                  placeholder={defaultName}
                  value={displayNameDraft[sender] ?? defaultName}
                  onChange={(e) => setDisplayNameDraft((d) => ({ ...d, [sender]: e.target.value }))}
                />
              </div>
            </div>
            {view === 'prompt-common' && (
              <div className="flex items-center gap-3 rounded-lg border border-app-border bg-app-soft px-3 py-2 text-sm">
                <span className="text-app-muted whitespace-nowrap">단기기억</span>
                <input
                  type="number"
                  min={5}
                  max={200}
                  className="w-20 rounded border border-app-border bg-app px-2 py-1 text-center text-app-text outline-none focus:border-brand"
                  value={shortTermTurns}
                  onChange={(e) => setShortTermTurns(e.target.value)}
                />
                <span className="text-app-muted">개 메시지 (최신 기준, 에이전트 재시작 시 적용)</span>
              </div>
            )}
            <textarea
              className="flex-1 min-h-[55vh] resize-none rounded-xl border border-app-border bg-app-soft px-4 py-3 text-sm text-app-text outline-none focus:border-brand font-mono leading-relaxed"
              placeholder={PROMPT_VIEW_PLACEHOLDER[view]}
              value={promptDraft[key]}
              onChange={(e) => setPromptDraft((d) => ({ ...d, [key]: e.target.value }))}
            />
          </div>
        );
      })()}

      {/* 메시지 목록 + 입력 */}
      {view === 'chat' && <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto space-y-2 pr-1"
        onScroll={() => {
          const el = scrollContainerRef.current;
          if (!el) return;
          isPinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        {messages.length === 0 && events.length === 0 && (
          <p className="py-16 text-center text-sm text-app-muted">
            AI 에이전트들이 접속하면 대화를 시작할 수 있습니다.<br />
            <span className="text-xs">python agent_client.py --name claude</span>
          </p>
        )}

        {/* 시스템 이벤트 (메시지와 인터리브) */}
        {events.map((ev) => (
          <p key={ev.id} className="text-center text-xs text-app-muted py-1">{ev.text}</p>
        ))}

        {messages.map((msg) => {
          const style = senderStyle(msg.sender);
          const isUser = msg.sender === 'user';
          const avatar = avatars[msg.sender];
          return (
            <div key={msg.id} className={`flex items-start gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
              {/* 아바타 */}
              <div className="shrink-0 mt-1">
                {avatar ? (
                  <img src={avatar} className="h-16 w-16 rounded-full object-cover border border-app-border" />
                ) : (
                  <div className={`h-16 w-16 rounded-full border flex items-center justify-center text-sm font-bold ${style.avatarBg}`}>
                    {getLabel(msg.sender).charAt(0)}
                  </div>
                )}
              </div>
              {/* 말풍선 */}
              <div className={`max-w-[70%] rounded-xl border px-4 py-3 text-sm ${style.bg}`}>
                <p className={`mb-1 text-xs font-semibold ${style.color}`}>
                  {getLabel(msg.sender)}
                  {msg.streaming && <span className="ml-1 animate-pulse">▍</span>}
                  {msg.ts && (
                    <span className="ml-2 font-normal text-app-muted">
                      {new Date(msg.ts).toLocaleTimeString()}
                    </span>
                  )}
                </p>
                <div className="prose prose-sm prose-invert max-w-none leading-relaxed
                  [&>*:first-child]:mt-0 [&>*:last-child]:mb-0
                  prose-code:before:content-none prose-code:after:content-none
                  prose-pre:bg-transparent prose-pre:p-0
                  [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-app-border [&_pre]:!bg-[#0d1117] [&_pre]:text-xs
                  [&_table]:text-xs [&_th]:border [&_th]:border-app-border [&_th]:px-2 [&_th]:py-1
                  [&_td]:border [&_td]:border-app-border [&_td]:px-2 [&_td]:py-1
                  [&_a]:text-brand [&_a]:no-underline [&_a:hover]:underline
                  [&_blockquote]:border-l-brand [&_blockquote]:text-app-muted">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeKatex, rehypeHighlight]}
                  >
                    {msg.content}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          );
        })}
      </div>}

      {view === 'chat' && (
        <div className="flex gap-2">
          <textarea
            className="flex-1 resize-none rounded-xl border border-app-border bg-app-soft px-4 py-3 text-sm outline-none focus:border-brand disabled:opacity-50"
            rows={3}
            placeholder={
              !connected ? '서버에 연결되지 않음' :
              participants.length <= 1 ? 'AI 에이전트 접속 대기 중...' :
              'Enter로 전송 · Shift+Enter로 줄바꿈'
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onCompositionStart={() => { isComposingRef.current = true; }}
            onCompositionEnd={() => { isComposingRef.current = false; }}
            onKeyDown={handleKeyDown}
            disabled={!connected}
          />
          <button
            className="self-end rounded-xl bg-brand px-5 py-3 text-sm font-medium text-white disabled:opacity-50"
            onClick={send}
            disabled={!connected || !input.trim()}
          >
            {isResponding ? '응답 중...' : '전송'}
          </button>
        </div>
      )}
    </div>
  );
}
