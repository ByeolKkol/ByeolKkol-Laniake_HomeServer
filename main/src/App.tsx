import { lazy, Suspense, useState } from 'react';
import { useChzzkData } from './useChzzkData';
import { getApiBase, getDozzleUrl, getHealthApiBase, getIotApiBase, getServerApiBase, getTapoApiBase, getWolApiBase } from './settingsStore';

// ── Lazy-loaded tab components ────────────────────────────────────────────────
const ServerControlTab  = lazy(() => import('./ServerControlTab'));
const ServerMonitoringTab = lazy(() => import('./ServerMonitoringTab'));
const WolTab            = lazy(() => import('./WolTab'));
const AiDiscussionTab   = lazy(() => import('./AiDiscussionTab'));
const SettingsTab       = lazy(() => import('./SettingsTab'));
const ChzzkOverviewTab  = lazy(() => import('./ChzzkOverviewTab'));
const ChzzkLiveTab      = lazy(() => import('./ChzzkLiveTab'));
const ChzzkChannelsTab  = lazy(() => import('./ChzzkChannelsTab'));
const ChzzkUploadsTab   = lazy(() => import('./ChzzkUploadsTab'));
const ChzzkAccountTab   = lazy(() => import('./ChzzkAccountTab'));
const IotTab            = lazy(() => import('./IotTab'));
const TapoSection       = lazy(() => import('./TapoSection'));
const HealthTab         = lazy(() => import('./HealthTab'));

// ── Types & constants ─────────────────────────────────────────────────────────
type AppKey = 'chzzk' | 'server' | 'wol' | 'discussion' | 'iot' | 'health' | 'settings';
type ChzzkTabKey = 'overview' | 'live' | 'uploads' | 'channels';
type ServerTabKey = 'hardware' | 'monitoring';
type IotTabKey = 'sensors' | 'tapo';
type HealthTabKey = 'weight' | 'activity';
type SettingsTabKey = 'app' | 'chzzk-account';
type DiscussionTabKey = 'chat' | 'prompt-common' | 'prompt-claude' | 'prompt-gemini' | 'prompt-codex';

const APP_TABS: Array<{ key: AppKey; label: string }> = [
  { key: 'chzzk', label: 'CHZZK 녹화' },
  { key: 'server', label: '서버 컨트롤' },
  { key: 'wol', label: 'PC 전원' },
  { key: 'discussion', label: 'AI 토론' },
  { key: 'iot', label: 'IoT' },
  { key: 'health', label: '헬스' },
  { key: 'settings', label: '설정' },
];

const IOT_TABS: Array<{ key: IotTabKey; label: string; hint: string }> = [
  { key: 'sensors', label: 'IoT 센서',      hint: '온도 · 습도 · 배터리' },
  { key: 'tapo',    label: 'Tapo 스마트 플러그', hint: '전력 · 에너지 · 켜기/끄기' },
];

const HEALTH_TABS: Array<{ key: HealthTabKey; label: string; hint: string }> = [
  { key: 'weight',   label: '체중',  hint: '체중 추이 · 체성분' },
  { key: 'activity', label: '활동',  hint: '심박수 · 운동 기록' },
];

const CHZZK_TABS: Array<{ key: ChzzkTabKey; label: string; hint: string }> = [
  { key: 'overview', label: 'Dashboard',      hint: 'System health and totals' },
  { key: 'live',     label: 'Live Monitoring', hint: 'Active recordings in real-time' },
  { key: 'uploads',  label: 'Uploads',         hint: 'Google Drive upload activity' },
  { key: 'channels', label: 'Channels',        hint: 'Manage CHZZK channel IDs' },
];

const SETTINGS_TABS: Array<{ key: SettingsTabKey; label: string; hint: string }> = [
  { key: 'app',          label: '앱 설정',       hint: '서버 IP 및 연결 설정' },
  { key: 'chzzk-account', label: 'CHZZK 계정',   hint: '쿠키 · Google Drive 설정' },
];

const SERVER_TABS: Array<{ key: ServerTabKey; label: string; hint: string }> = [
  { key: 'hardware',   label: 'Hardware Control', hint: 'Battery, fan & LED' },
  { key: 'monitoring', label: 'Monitoring',        hint: 'Real-time server metrics' },
];

const DISCUSSION_NAV = [
  { key: 'chat' as const,          label: 'AI 토론',        hint: 'Claude · Gemini · Codex 토론' },
  { key: 'prompt-common' as const, label: '마스터 프롬프트', hint: '모든 에이전트 공통 지침' },
  { key: 'prompt-claude' as const, label: 'Claude',         hint: 'Claude 개별 시스템 프롬프트' },
  { key: 'prompt-gemini' as const, label: 'Gemini',         hint: 'Gemini 개별 시스템 프롬프트' },
  { key: 'prompt-codex' as const,  label: 'Codex',          hint: 'Codex 개별 시스템 프롬프트' },
];

// ── Shared components ─────────────────────────────────────────────────────────

function NavItem({ label, hint, active, onClick }: {
  label: string; hint: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      className={`w-full rounded-xl border px-3 py-2 text-left transition ${
        active
          ? 'border-brand bg-brand/20 text-app-text'
          : 'border-transparent bg-transparent text-app-muted hover:border-app-border hover:bg-app-soft'
      }`}
      onClick={onClick}
    >
      <p className="text-sm font-medium">{label}</p>
      <p className="text-xs">{hint}</p>
    </button>
  );
}

function TabFallback() {
  return <div className="flex h-32 items-center justify-center text-sm text-app-muted">로딩 중...</div>;
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [appKey, setAppKey] = useState<AppKey>('chzzk');
  const [activeTab, setActiveTab] = useState<ChzzkTabKey>('overview');
  const [serverTab, setServerTab] = useState<ServerTabKey>('hardware');
  const [iotTab, setIotTab] = useState<IotTabKey>('sensors');
  const [healthTab, setHealthTab] = useState<HealthTabKey>('weight');
  const [discussionTab, setDiscussionTab] = useState<DiscussionTabKey>('chat');
  const [settingsTab, setSettingsTab] = useState<SettingsTabKey>('app');

  const {
    loading, message, health, channels, activeRecordings, recordings, uploads, activeUploads,
    globalCookieStatus, googleDriveStatus, channelQualityDrafts, setChannelQualityDrafts,
    activeChannelCount, retryingRecordingId, deletingRecordingId, stoppingRecordingId,
    savingChannel, savingCookies, savingDriveCredentials,
    refreshAll,
    handleAddChannel, handleDeleteChannel, handleToggleChannel, handleSaveChannelQuality,
    handleManualRecord, handleSaveCookies, handleUploadDriveCredentials,
    handleRetryUpload, handleStopRecording, handleDeleteRecording,
    handleBulkDeleteRecordings, handleBulkDeleteUploads,
  } = useChzzkData();

  const mainTitle =
    appKey === 'chzzk' ? (CHZZK_TABS.find((t) => t.key === activeTab)?.label ?? '') :
    appKey === 'server' ? (SERVER_TABS.find((t) => t.key === serverTab)?.label ?? '') :
    appKey === 'wol' ? 'PC 전원 제어' :
    appKey === 'discussion' ? 'AI 토론' :
    appKey === 'iot' ? (IOT_TABS.find((t) => t.key === iotTab)?.label ?? '') :
    appKey === 'health' ? (HEALTH_TABS.find((t) => t.key === healthTab)?.label ?? '') :
    SETTINGS_TABS.find((t) => t.key === settingsTab)?.label ?? '설정';

  const mainSubtitle =
    appKey === 'chzzk' ? `Backend API: ${getApiBase()}` :
    appKey === 'server' ? `Server API: ${getServerApiBase()}` :
    appKey === 'wol' ? `WOL API: ${getWolApiBase()}` :
    appKey === 'iot' && iotTab === 'sensors' ? `IoT API: ${getIotApiBase()}` :
    appKey === 'iot' && iotTab === 'tapo' ? `Tapo API: ${getTapoApiBase()}` :
    appKey === 'health' ? `Health API: ${getHealthApiBase()}` : '';

  return (
    <div className="flex h-screen overflow-hidden flex-col bg-app text-app-text">

      {/* ── Top nav ── */}
      <header className="shrink-0 border-b border-app-border bg-panel px-6 py-3">
        <div className="flex items-center gap-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-app-muted">Portal</p>
          <nav className="flex gap-2">
            {APP_TABS.map((app) => (
              <button
                key={app.key}
                className={`rounded-lg border px-4 py-1.5 text-sm font-medium transition ${
                  appKey === app.key
                    ? 'border-brand bg-brand/20 text-app-text'
                    : 'border-transparent text-app-muted hover:border-app-border hover:bg-app-soft'
                }`}
                onClick={() => setAppKey(app.key)}
              >
                {app.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex flex-1 min-h-0 gap-5 p-4 md:p-6">

        {/* Sidebar */}
        <aside className="w-56 shrink-0 self-start rounded-2xl border border-app-border bg-panel p-4 shadow-panel">
          <nav className="space-y-1">
            {appKey === 'chzzk' && CHZZK_TABS.map((tab) => (
              <NavItem key={tab.key} label={tab.label} hint={tab.hint} active={activeTab === tab.key} onClick={() => setActiveTab(tab.key)} />
            ))}
            {appKey === 'server' && SERVER_TABS.map((tab) => (
              <NavItem key={tab.key} label={tab.label} hint={tab.hint} active={serverTab === tab.key} onClick={() => setServerTab(tab.key)} />
            ))}
            {appKey === 'server' && (
              <a
                href={getDozzleUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full flex-col rounded-xl border border-transparent px-3 py-2 text-left text-app-muted transition hover:border-app-border hover:bg-app-soft"
              >
                <p className="text-sm font-medium">Dozzle 로그</p>
                <p className="text-xs">컨테이너 로그 뷰어 ↗</p>
              </a>
            )}
            {appKey === 'wol' && (
              <NavItem label="PC 전원 제어" hint="WOL · 끄기 · 재시작" active={true} onClick={() => undefined} />
            )}
            {appKey === 'discussion' && DISCUSSION_NAV.map((item) => (
              <NavItem key={item.key} label={item.label} hint={item.hint} active={discussionTab === item.key} onClick={() => setDiscussionTab(item.key)} />
            ))}
            {appKey === 'iot' && IOT_TABS.map((tab) => (
              <NavItem key={tab.key} label={tab.label} hint={tab.hint} active={iotTab === tab.key} onClick={() => setIotTab(tab.key)} />
            ))}
            {appKey === 'health' && HEALTH_TABS.map((tab) => (
              <NavItem key={tab.key} label={tab.label} hint={tab.hint} active={healthTab === tab.key} onClick={() => setHealthTab(tab.key)} />
            ))}
            {appKey === 'settings' && SETTINGS_TABS.map((tab) => (
              <NavItem key={tab.key} label={tab.label} hint={tab.hint} active={settingsTab === tab.key} onClick={() => setSettingsTab(tab.key)} />
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-h-0 flex flex-col overflow-y-auto rounded-2xl border border-app-border bg-panel p-4 shadow-panel md:p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">{mainTitle}</h2>
              <p className="text-sm text-app-muted">{mainSubtitle}</p>
            </div>
            {appKey === 'chzzk' && (
              <button
                className="rounded-lg border border-app-border px-3 py-2 text-sm hover:bg-app-soft"
                onClick={() => void refreshAll()}
              >
                {loading ? 'Refreshing...' : 'Refresh'}
              </button>
            )}
          </div>

          {message ? (
            <p className="mb-3 rounded-lg border border-app-border bg-app-soft px-3 py-2 text-sm">{message}</p>
          ) : null}

          {/* AI 토론은 항상 마운트 — WebSocket 연결 및 스크롤 위치 유지 */}
          <div className={appKey === 'discussion' ? 'flex-1 min-h-0 flex flex-col' : 'hidden'}>
            <Suspense fallback={<TabFallback />}>
              <AiDiscussionTab view={discussionTab} isActive={appKey === 'discussion'} />
            </Suspense>
          </div>

          <Suspense fallback={<TabFallback />}>
            {appKey === 'server' && serverTab === 'hardware' && <ServerControlTab />}
            {appKey === 'server' && serverTab === 'monitoring' && <ServerMonitoringTab />}
            {appKey === 'wol' && <WolTab />}
            {appKey === 'settings' && settingsTab === 'app' && <SettingsTab />}
            {appKey === 'settings' && settingsTab === 'chzzk-account' && (
              <ChzzkAccountTab
                globalCookieStatus={globalCookieStatus} googleDriveStatus={googleDriveStatus}
                savingCookies={savingCookies} savingDriveCredentials={savingDriveCredentials}
                onSaveCookies={(a, s) => void handleSaveCookies(a, s)}
                onUploadDriveCredentials={(f) => void handleUploadDriveCredentials(f)}
              />
            )}

            {appKey === 'chzzk' && activeTab === 'overview' && (
              <ChzzkOverviewTab
                health={health} channels={channels} activeChannelCount={activeChannelCount}
                activeUploads={activeUploads} recordings={recordings}
                retryingRecordingId={retryingRecordingId} deletingRecordingId={deletingRecordingId}
                onRetryUpload={(id) => void handleRetryUpload(id)}
                onDeleteRecording={(id) => void handleDeleteRecording(id)}
                onBulkDelete={(ids) => void handleBulkDeleteRecordings(ids)}
              />
            )}
            {appKey === 'chzzk' && activeTab === 'live' && (
              <ChzzkLiveTab
                health={health} activeRecordings={activeRecordings}
                stoppingRecordingId={stoppingRecordingId}
                onStopRecording={(id) => void handleStopRecording(id)}
              />
            )}
            {appKey === 'chzzk' && activeTab === 'channels' && (
              <ChzzkChannelsTab
                channels={channels} channelQualityDrafts={channelQualityDrafts}
                setChannelQualityDrafts={setChannelQualityDrafts} savingChannel={savingChannel}
                onAddChannel={(id, name, quality) => void handleAddChannel(id, name, quality)}
                onDeleteChannel={(id) => void handleDeleteChannel(id)}
                onToggleChannel={(ch) => void handleToggleChannel(ch)}
                onSaveChannelQuality={(ch, q) => void handleSaveChannelQuality(ch, q)}
                onManualRecord={(id) => void handleManualRecord(id)}
              />
            )}
            {appKey === 'chzzk' && activeTab === 'uploads' && (
              <ChzzkUploadsTab uploads={uploads} recordings={recordings}
                onBulkDelete={(ids) => void handleBulkDeleteUploads(ids)} />
            )}
            {appKey === 'iot' && iotTab === 'sensors' && <IotTab />}
            {appKey === 'iot' && iotTab === 'tapo' && <TapoSection />}
            {appKey === 'health' && <HealthTab view={healthTab} />}
          </Suspense>
        </main>
      </div>
    </div>
  );
}
