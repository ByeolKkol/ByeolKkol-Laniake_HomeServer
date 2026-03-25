import {
  type DiscussionView,
  type PromptConfig,
  PROMPT_VIEW_KEY, PROMPT_VIEW_LABEL, PROMPT_VIEW_PLACEHOLDER, PROMPT_VIEW_SENDER,
  DISPLAY_NAME_DEFAULT, senderStyle,
} from './constants';

interface Props {
  view: DiscussionView;
  promptDraft: PromptConfig;
  promptSaving: boolean;
  shortTermTurns: string;
  displayNameDraft: Record<string, string>;
  avatarDraft: Record<string, string>;
  onPromptChange: (key: keyof PromptConfig, value: string) => void;
  onShortTermTurnsChange: (value: string) => void;
  onDisplayNameChange: (sender: string, value: string) => void;
  onAvatarChange: (sender: string, file: File) => void;
  onAvatarRemove: (sender: string) => void;
  onSave: () => void;
}

export const PromptPanel = ({
  view, promptDraft, promptSaving, shortTermTurns,
  displayNameDraft, avatarDraft,
  onPromptChange, onShortTermTurnsChange, onDisplayNameChange,
  onAvatarChange, onAvatarRemove, onSave,
}: Props) => {
  const key = PROMPT_VIEW_KEY[view];
  const sender = PROMPT_VIEW_SENDER[view];
  if (!key) return null;

  const defaultName = DISPLAY_NAME_DEFAULT[sender] ?? '';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-app-text">{PROMPT_VIEW_LABEL[view]}</span>
        <button
          className="rounded px-4 py-1.5 bg-brand text-white text-sm hover:opacity-80 disabled:opacity-40 transition-opacity"
          onClick={onSave}
          disabled={promptSaving}
        >
          {promptSaving ? '저장 중...' : '저장'}
        </button>
      </div>

      <div className="flex items-center gap-4 rounded-lg border border-app-border bg-app-soft px-3 py-3">
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
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onAvatarChange(sender, f); }}
              />
            </label>
            {avatarDraft[sender] && (
              <button
                className="rounded border border-rose-500/40 px-2 py-0.5 text-xs text-rose-400 hover:bg-rose-500/10 transition-colors"
                onClick={() => onAvatarRemove(sender)}
              >
                제거
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-1 flex-1">
          <label className="text-xs text-app-muted">표시 이름</label>
          <input
            className="rounded border border-app-border bg-app px-2 py-1.5 text-sm text-app-text outline-none focus:border-brand"
            placeholder={defaultName}
            value={displayNameDraft[sender] ?? defaultName}
            onChange={(e) => onDisplayNameChange(sender, e.target.value)}
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
            onChange={(e) => onShortTermTurnsChange(e.target.value)}
          />
          <span className="text-app-muted">개 메시지 (최신 기준, 에이전트 재시작 시 적용)</span>
        </div>
      )}

      <textarea
        className="flex-1 min-h-[55vh] resize-none rounded-xl border border-app-border bg-app-soft px-4 py-3 text-sm text-app-text outline-none focus:border-brand font-mono leading-relaxed"
        placeholder={PROMPT_VIEW_PLACEHOLDER[view]}
        value={promptDraft[key]}
        onChange={(e) => onPromptChange(key, e.target.value)}
      />
    </div>
  );
};
