import { useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import { type ChatItem, senderStyle } from './constants';

interface Props {
  items: ChatItem[];
  avatars: Record<string, string>;
  connected: boolean;
  participants: string[];
  input: string;
  isResponding: boolean;
  getLabel: (sender: string) => string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  scrollContainerRef: React.RefObject<HTMLDivElement>;
  isPinnedRef: React.MutableRefObject<boolean>;
}

const MessageBubble = ({ item, avatars, getLabel }: {
  item: Extract<ChatItem, { kind: 'msg' }>;
  avatars: Record<string, string>;
  getLabel: (sender: string) => string;
}) => {
  const style = senderStyle(item.sender);
  const isUser = item.sender === 'user';
  const avatar = avatars[item.sender];

  return (
    <div className={`flex items-start gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className="shrink-0 mt-1">
        {avatar ? (
          <img src={avatar} className="h-16 w-16 rounded-full object-cover border border-app-border" />
        ) : (
          <div className={`h-16 w-16 rounded-full border flex items-center justify-center text-sm font-bold ${style.avatarBg}`}>
            {getLabel(item.sender).charAt(0)}
          </div>
        )}
      </div>
      <div className={`max-w-[70%] rounded-xl border px-4 py-3 text-sm ${style.bg}`}>
        <p className={`mb-1 text-xs font-semibold ${style.color}`}>
          {getLabel(item.sender)}
          {item.streaming && <span className="ml-1 animate-pulse">▍</span>}
          {item.ts && (
            <span className="ml-2 font-normal text-app-muted">
              {new Date(item.ts).toLocaleTimeString()}
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
            {item.content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
};

export const ChatView = ({
  items, avatars, connected, participants, input, isResponding,
  getLabel, onInputChange, onSend, scrollContainerRef, isPinnedRef,
}: Props) => {
  const isComposingRef = useRef(false);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !isComposingRef.current) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <>
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto space-y-2 pr-1"
        onScroll={() => {
          const el = scrollContainerRef.current;
          if (!el) return;
          isPinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        {items.length === 0 && (
          <p className="py-16 text-center text-sm text-app-muted">
            AI 에이전트들이 접속하면 대화를 시작할 수 있습니다.<br />
            <span className="text-xs">python agent_client.py --name claude</span>
          </p>
        )}

        {items.map((item) => {
          if (item.kind === 'event') {
            return <p key={item.id} className="text-center text-xs text-app-muted py-1">{item.text}</p>;
          }
          return <MessageBubble key={item.id} item={item} avatars={avatars} getLabel={getLabel} />;
        })}
      </div>

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
          onChange={(e) => onInputChange(e.target.value)}
          onCompositionStart={() => { isComposingRef.current = true; }}
          onCompositionEnd={() => { isComposingRef.current = false; }}
          onKeyDown={handleKeyDown}
          disabled={!connected}
        />
        <button
          className="self-end rounded-xl bg-brand px-5 py-3 text-sm font-medium text-white disabled:opacity-50"
          onClick={onSend}
          disabled={!connected || !input.trim()}
        >
          {isResponding ? '응답 중...' : '전송'}
        </button>
      </div>
    </>
  );
};
