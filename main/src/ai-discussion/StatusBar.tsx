import { type DebateState, senderStyle } from './constants';

interface Props {
  connected: boolean;
  participants: string[];
  debate: DebateState;
  maxTurnsInput: string;
  getLabel: (sender: string) => string;
  onReconnect: () => void;
  onKick: (name: string) => void;
  onStartDebate: () => void;
  onStopDebate: () => void;
  onMaxTurnsChange: (value: string) => void;
}

export const StatusBar = ({
  connected, participants, debate, maxTurnsInput,
  getLabel, onReconnect, onKick, onStartDebate, onStopDebate, onMaxTurnsChange,
}: Props) => (
  <div className="flex flex-col gap-2 rounded-lg border border-app-border bg-app-soft px-3 py-2 text-xs">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-rose-400'}`} />
        <span className="text-app-muted">{connected ? '연결됨' : '연결 끊김'}</span>
        {!connected && (
          <button className="ml-1 text-brand hover:underline" onClick={onReconnect}>재연결</button>
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
                  onClick={() => onKick(p)}
                >✕</button>
              )}
            </span>
          ))
        }
      </div>
    </div>

    <div className="flex items-center gap-2 border-t border-app-border pt-2">
      {debate.active ? (
        <>
          <span className="flex items-center gap-1 text-violet-300 font-semibold">
            <span className="animate-pulse">●</span> 토론 중
          </span>
          <span className="text-app-muted">{debate.round} / {debate.maxTurns} 라운드</span>
          <button
            className="ml-auto rounded-lg bg-rose-500/20 border border-rose-500/40 px-3 py-1 text-rose-300 hover:bg-rose-500/30 transition-colors"
            onClick={onStopDebate}
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
            onChange={(e) => onMaxTurnsChange(e.target.value)}
          />
          <span className="text-app-muted">턴</span>
          <button
            className="ml-auto rounded-lg bg-violet-500/20 border border-violet-500/40 px-3 py-1 text-violet-300 hover:bg-violet-500/30 transition-colors disabled:opacity-40"
            onClick={onStartDebate}
            disabled={!connected || participants.length <= 1}
          >
            토론 시작
          </button>
        </>
      )}
    </div>
  </div>
);
