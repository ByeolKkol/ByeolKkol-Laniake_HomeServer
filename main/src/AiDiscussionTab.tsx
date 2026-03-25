import { useEffect, useRef, useState } from 'react';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github-dark.css';
import { getDiscussionHost } from './settingsStore';
import {
  type ChatItem, type DebateState, type DiscussionView, type PromptConfig,
  PROMPT_VIEW_KEY, PROMPT_VIEW_SENDER, DISPLAY_NAME_DEFAULT, uid,
} from './ai-discussion/constants';
import { StatusBar } from './ai-discussion/StatusBar';
import { PromptPanel } from './ai-discussion/PromptPanel';
import { ChatView } from './ai-discussion/ChatView';

export default function AiDiscussionTab({ view = 'chat', isActive = true }: { view?: DiscussionView; isActive?: boolean }) {
  const [items, setItems] = useState<ChatItem[]>([]);
  const [participants, setParticipants] = useState<string[]>([]);
  const [streamingMap, setStreamingMap] = useState<Record<string, number>>({});
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
  const isPinnedRef = useRef(true);

  useEffect(() => { connect(); loadPrompts(); void loadAgentConfig(); return () => wsRef.current?.close(); }, []);
  useEffect(() => { if (isPinnedRef.current && scrollContainerRef.current) scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight; }, [items]);
  useEffect(() => { if (isActive && scrollContainerRef.current) scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight; }, [isActive]);

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
    } catch (e) { console.warn('loadAgentConfig failed:', e); }
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
    } catch (e) { console.warn('loadPrompts failed:', e); }
  }

  async function savePrompts() {
    const host = getDiscussionHost();
    const key = PROMPT_VIEW_KEY[view];
    const sender = PROMPT_VIEW_SENDER[view];
    if (!key) return;
    setPromptSaving(true);
    try {
      await fetch(`http://${host}/prompts/${key}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: promptDraft[key] }),
      });
      if (view === 'prompt-common') {
        await fetch(`http://${host}/settings/short_term_turns`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: shortTermTurns }),
        });
      }
      if (sender) {
        const display_name = displayNameDraft[sender] ?? DISPLAY_NAME_DEFAULT[sender] ?? '';
        const avatar_data = avatarDraft[sender] ?? '';
        await fetch(`http://${host}/agent-config/${sender}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ display_name, avatar_data }),
        });
        setDisplayNames((d) => ({ ...d, [sender]: display_name || DISPLAY_NAME_DEFAULT[sender] }));
        setAvatars((d) => ({ ...d, [sender]: avatar_data }));
      }
    } finally { setPromptSaving(false); }
  }

  function handleAvatarChange(sender: string, file: File) {
    const reader = new FileReader();
    reader.onload = (e) => setAvatarDraft((d) => ({ ...d, [sender]: e.target?.result as string }));
    reader.readAsDataURL(file);
  }

  function getLabel(sender: string): string {
    return displayNames[sender] ?? DISPLAY_NAME_DEFAULT[sender] ?? sender.toUpperCase();
  }

  async function startDebate() {
    const host = getDiscussionHost();
    const maxTurns = Math.max(1, parseInt(maxTurnsInput) || 10);
    await fetch(`http://${host}/debate/start`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ max_turns: maxTurns }),
    });
  }

  async function stopDebate() {
    const host = getDiscussionHost();
    await fetch(`http://${host}/debate/stop`, { method: 'POST' });
  }

  function addEvent(text: string) {
    setItems((prev) => [...prev, { kind: 'event' as const, id: uid(), text }]);
  }

  function connect() {
    const host = getDiscussionHost();
    const ws = new WebSocket(`ws://${host}/ws/join/user`);
    ws.onopen = () => { setConnected(true); loadHistory(host); };
    ws.onclose = () => { setConnected(false); };
    ws.onerror = () => { setConnected(false); };
    ws.onmessage = (e: MessageEvent<string>) => handleWsMessage(JSON.parse(e.data));
    wsRef.current = ws;
  }

  async function loadHistory(host: string) {
    try {
      const res = await fetch(`http://${host}/history`);
      const data = await res.json() as { messages: { sender: string; content: string; ts: string }[] };
      setItems(data.messages.map((m) => ({ kind: 'msg' as const, id: uid(), sender: m.sender, content: m.content, ts: m.ts })));
    } catch (e) { console.warn('loadHistory failed:', e); }
  }

  function handleWsMessage(data: Record<string, unknown>) {
    if (data.type === 'debate_start') {
      const maxTurns = (data as unknown as { max_turns: number }).max_turns;
      setDebate({ active: true, round: 0, maxTurns });
      addEvent(`토론 시작 (최대 ${maxTurns}턴)`);
    } else if (data.type === 'debate_end') {
      const d = data as unknown as { reason: string; round: number };
      setDebate((prev) => ({ ...prev, active: false, round: d.round }));
      const reasonLabel: Record<string, string> = { consensus: '합의 도달', max_turns: '최대 턴 완료', user_stopped: '사용자 중단' };
      addEvent(`토론 종료 — ${reasonLabel[d.reason] ?? d.reason} (${d.round}라운드)`);
    } else if (data.type === 'participants' && data.list) {
      setParticipants(data.list as string[]);
    } else if (data.type === 'join' && data.name) {
      setParticipants((p) => [...new Set([...p, data.name as string])]);
      addEvent(`${data.name} 입장`);
    } else if (data.type === 'leave' && data.name) {
      setParticipants((p) => p.filter((n) => n !== data.name));
      addEvent(`${data.name} 퇴장`);
    } else if (data.type === 'chunk' && data.sender && data.content) {
      handleStreamChunk(data.sender as string, data.content as string);
    } else if (data.type === 'message' && data.sender && data.content !== undefined) {
      handleStreamComplete(data.sender as string, data.content as string, data.ts as string | undefined);
    }
  }

  function handleStreamChunk(sender: string, content: string) {
    setStreamingMap((prev) => {
      const existingId = prev[sender];
      if (existingId !== undefined) {
        setItems((cur) => cur.map((item) =>
          item.kind === 'msg' && item.id === existingId ? { ...item, content: item.content + content } : item
        ));
        return prev;
      }
      const id = uid();
      setItems((cur) => [...cur, { kind: 'msg', id, sender, content, streaming: true }]);
      return { ...prev, [sender]: id };
    });
  }

  function handleStreamComplete(sender: string, content: string, ts: string | undefined) {
    if (sender === 'codex') setDebate((prev) => prev.active ? { ...prev, round: prev.round + 1 } : prev);
    setStreamingMap((prev) => {
      const existingId = prev[sender];
      if (existingId !== undefined) {
        setItems((cur) => cur.map((item) =>
          item.kind === 'msg' && item.id === existingId ? { ...item, content, streaming: false, ts } : item
        ));
        const next = { ...prev };
        delete next[sender];
        return next;
      }
      setItems((cur) => [...cur, { kind: 'msg', id: uid(), sender, content, ts }]);
      return prev;
    });
  }

  function send() {
    const text = input.trim();
    if (!text || !connected) return;
    wsRef.current!.send(JSON.stringify({ type: 'message', content: text }));
    setInput('');
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-3">
      <StatusBar
        connected={connected} participants={participants} debate={debate}
        maxTurnsInput={maxTurnsInput} getLabel={getLabel}
        onReconnect={connect}
        onKick={(name) => wsRef.current?.send(JSON.stringify({ type: 'kick', name }))}
        onStartDebate={startDebate} onStopDebate={stopDebate}
        onMaxTurnsChange={setMaxTurnsInput}
      />

      {view in PROMPT_VIEW_KEY && (
        <PromptPanel
          view={view} promptDraft={promptDraft} promptSaving={promptSaving}
          shortTermTurns={shortTermTurns} displayNameDraft={displayNameDraft} avatarDraft={avatarDraft}
          onPromptChange={(key, value) => setPromptDraft((d) => ({ ...d, [key]: value }))}
          onShortTermTurnsChange={setShortTermTurns}
          onDisplayNameChange={(sender, value) => setDisplayNameDraft((d) => ({ ...d, [sender]: value }))}
          onAvatarChange={handleAvatarChange}
          onAvatarRemove={(sender) => setAvatarDraft((d) => ({ ...d, [sender]: '' }))}
          onSave={savePrompts}
        />
      )}

      {view === 'chat' && (
        <ChatView
          items={items} avatars={avatars} connected={connected} participants={participants}
          input={input} isResponding={Object.keys(streamingMap).length > 0}
          getLabel={getLabel} onInputChange={setInput} onSend={send}
          scrollContainerRef={scrollContainerRef} isPinnedRef={isPinnedRef}
        />
      )}
    </div>
  );
}
