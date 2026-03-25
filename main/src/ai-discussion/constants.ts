export type ChatItem =
  | { kind: 'msg'; id: number; sender: string; content: string; ts?: string; streaming?: boolean }
  | { kind: 'event'; id: number; text: string };

export interface DebateState {
  active: boolean;
  round: number;
  maxTurns: number;
}

export interface PromptConfig {
  common: string;
  claude: string;
  gemini: string;
  codex: string;
}

export type DiscussionView = 'chat' | 'prompt-common' | 'prompt-claude' | 'prompt-gemini' | 'prompt-codex';

export const AGENT_STYLE: Record<string, { label: string; color: string; bg: string; avatarBg: string }> = {
  user:   { label: '사용자',  color: 'text-app-text',     bg: 'border-app-border bg-app-soft',       avatarBg: 'bg-app-soft border-app-border text-app-text' },
  claude: { label: 'CLAUDE', color: 'text-sky-300',       bg: 'border-sky-500/30 bg-sky-500/10',     avatarBg: 'bg-sky-500/20 border-sky-500/40 text-sky-300' },
  gemini: { label: 'GEMINI', color: 'text-violet-300',    bg: 'border-violet-500/30 bg-violet-500/10', avatarBg: 'bg-violet-500/20 border-violet-500/40 text-violet-300' },
  codex:  { label: 'CODEX',  color: 'text-amber-300',     bg: 'border-amber-500/30 bg-amber-500/10', avatarBg: 'bg-amber-500/20 border-amber-500/40 text-amber-300' },
};

export const senderStyle = (name: string) =>
  AGENT_STYLE[name] ?? {
    label: name.toUpperCase(),
    color: 'text-emerald-300',
    bg: 'border-emerald-500/30 bg-emerald-500/10',
    avatarBg: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300',
  };

export const PROMPT_VIEW_KEY: Record<string, keyof PromptConfig> = {
  'prompt-common': 'common',
  'prompt-claude': 'claude',
  'prompt-gemini': 'gemini',
  'prompt-codex': 'codex',
};

export const PROMPT_VIEW_LABEL: Record<string, string> = {
  'prompt-common': '마스터 프롬프트 (모든 에이전트 공통)',
  'prompt-claude': 'Claude 개별 시스템 프롬프트',
  'prompt-gemini': 'Gemini 개별 시스템 프롬프트',
  'prompt-codex': 'Codex 개별 시스템 프롬프트',
};

export const PROMPT_VIEW_PLACEHOLDER: Record<string, string> = {
  'prompt-common': '모든 에이전트의 시스템 프롬프트 뒤에 추가됩니다...',
  'prompt-claude': 'Claude의 기본 시스템 프롬프트를 대체합니다. 비워두면 기본값 사용.',
  'prompt-gemini': 'Gemini의 기본 시스템 프롬프트를 대체합니다. 비워두면 기본값 사용.',
  'prompt-codex': 'Codex의 기본 시스템 프롬프트를 대체합니다. 비워두면 기본값 사용.',
};

export const PROMPT_VIEW_SENDER: Record<string, string> = {
  'prompt-common': 'user',
  'prompt-claude': 'claude',
  'prompt-gemini': 'gemini',
  'prompt-codex': 'codex',
};

export const DISPLAY_NAME_DEFAULT: Record<string, string> = {
  user: '사용자',
  claude: 'CLAUDE',
  gemini: 'GEMINI',
  codex: 'CODEX',
};

let nextId = 0;
export const uid = () => ++nextId;
