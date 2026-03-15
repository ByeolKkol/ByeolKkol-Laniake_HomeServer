import { useEffect, useState } from 'react';
import {
  fetchServerStatus,
  setBatteryLimit,
  setDisplayBrightness,
  setLed,
  setProfile,
  turnOffDisplay,
  turnOnDisplay,
  type HardwareStatus,
} from './serverApi';

const PROFILES = ['Quiet', 'Balanced', 'Performance'] as const;
type Profile = (typeof PROFILES)[number];

const PROFILE_COLOR: Record<Profile, string> = {
  Quiet: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
  Balanced: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  Performance: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
};

export default function ServerControlTab() {
  const [status, setStatus] = useState<HardwareStatus | null>(null);
  const [error, setError] = useState('');
  const [limitDraft, setLimitDraft] = useState(60);
  const [brightnessDraft, setBrightnessDraft] = useState(50);
  const [ledColor, setLedColor] = useState('#000000');
  const [applying, setApplying] = useState<string | null>(null);

  const refresh = () => {
    void fetchServerStatus()
      .then((s) => {
        setStatus(s);
        if (s.battery_limit != null) setLimitDraft(s.battery_limit);
        if (s.display_brightness != null) setBrightnessDraft(s.display_brightness);
      })
      .catch((e: Error) => setError(e.message));
  };

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 5000);
    return () => window.clearInterval(id);
  }, []);

  const applyBatteryLimit = async () => {
    setApplying('battery');
    setError('');
    try {
      await setBatteryLimit(limitDraft);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setApplying(null);
    }
  };

  const applyProfile = async (profile: Profile) => {
    setApplying(`profile-${profile}`);
    setError('');
    try {
      await setProfile(profile);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setApplying(null);
    }
  };

  const applyBrightness = async (value: number) => {
    setApplying('brightness');
    setError('');
    try {
      await setDisplayBrightness(value);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setApplying(null);
    }
  };

  const applyDisplayOff = async () => {
    setApplying('display-off');
    setError('');
    try {
      await turnOffDisplay();
      setBrightnessDraft(0);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setApplying(null);
    }
  };

  const applyDisplayOn = async () => {
    setApplying('display-on');
    setError('');
    try {
      await turnOnDisplay();
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setApplying(null);
    }
  };

  const applyLed = async (color: string) => {
    setApplying('led');
    setError('');
    try {
      await setLed(color.replace('#', ''));
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setApplying(null);
    }
  };

  return (
    <section className="space-y-4">
      {error && (
        <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {error}
        </p>
      )}

      {/* 상태 요약 */}
      <div className="grid gap-4 md:grid-cols-4">
        <article className="rounded-xl border border-app-border bg-app-soft p-4">
          <p className="text-xs text-app-muted">배터리 잔량</p>
          <p className="mt-2 text-lg font-semibold">
            {status?.battery_capacity != null ? `${status.battery_capacity}%` : '-'}
          </p>
        </article>
        <article className="rounded-xl border border-app-border bg-app-soft p-4">
          <p className="text-xs text-app-muted">충전 제한</p>
          <p className="mt-2 text-lg font-semibold">
            {status?.battery_limit != null ? `${status.battery_limit}%` : '-'}
          </p>
        </article>
        <article className="rounded-xl border border-app-border bg-app-soft p-4">
          <p className="text-xs text-app-muted">팬 프로필</p>
          <p className="mt-2 text-lg font-semibold">{status?.profile ?? '-'}</p>
        </article>
        <article className="rounded-xl border border-app-border bg-app-soft p-4">
          <p className="text-xs text-app-muted">CPU 온도</p>
          <p className={`mt-2 text-lg font-semibold ${
            (status?.cpu_temp ?? 0) > 80 ? 'text-rose-400' :
            (status?.cpu_temp ?? 0) > 65 ? 'text-amber-400' : ''
          }`}>
            {status?.cpu_temp != null ? `${status.cpu_temp.toFixed(1)}°C` : '-'}
          </p>
        </article>
        <article className="rounded-xl border border-app-border bg-app-soft p-4">
          <p className="text-xs text-app-muted">화면 밝기</p>
          <p className="mt-2 text-lg font-semibold">
            {status?.display_brightness != null
              ? status.display_brightness === 0 ? '꺼짐' : `${status.display_brightness}%`
              : '-'}
          </p>
        </article>
      </div>

      {/* 배터리 충전 제한 */}
      <article className="rounded-xl border border-app-border bg-app-soft p-4">
        <h3 className="mb-3 text-sm font-semibold">배터리 충전 제한</h3>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={20}
            max={100}
            step={5}
            value={limitDraft}
            onChange={(e) => setLimitDraft(Number(e.target.value))}
            className="flex-1 accent-brand"
          />
          <span className="w-12 text-center text-sm font-semibold">{limitDraft}%</span>
          <button
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            onClick={() => void applyBatteryLimit()}
            disabled={applying === 'battery'}
          >
            {applying === 'battery' ? '적용 중...' : '적용'}
          </button>
        </div>
        <p className="mt-2 text-xs text-app-muted">24시간 전원 연결 시 60% 권장 (배터리 팽창 방지)</p>
      </article>

      {/* 팬 프로필 */}
      <article className="rounded-xl border border-app-border bg-app-soft p-4">
        <h3 className="mb-3 text-sm font-semibold">팬 프로필</h3>
        <div className="flex gap-3">
          {PROFILES.map((p) => (
            <button
              key={p}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition disabled:opacity-60 ${
                status?.profile === p
                  ? PROFILE_COLOR[p]
                  : 'border-app-border bg-panel text-app-muted hover:bg-app-soft'
              }`}
              onClick={() => void applyProfile(p)}
              disabled={applying === `profile-${p}`}
            >
              {applying === `profile-${p}` ? '적용 중...' : p}
            </button>
          ))}
        </div>
      </article>

      {/* 화면 밝기 */}
      <article className="rounded-xl border border-app-border bg-app-soft p-4">
        <h3 className="mb-3 text-sm font-semibold">화면 밝기</h3>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={brightnessDraft}
            onChange={(e) => setBrightnessDraft(Number(e.target.value))}
            className="flex-1 accent-brand"
          />
          <span className="w-12 text-center text-sm font-semibold">
            {brightnessDraft === 0 ? '꺼짐' : `${brightnessDraft}%`}
          </span>
          <button
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            onClick={() => void applyBrightness(brightnessDraft)}
            disabled={applying === 'brightness'}
          >
            {applying === 'brightness' ? '적용 중...' : '적용'}
          </button>
          <button
            className="rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700 disabled:opacity-60"
            onClick={() => void applyDisplayOff()}
            disabled={applying === 'display-off' || applying === 'display-on'}
          >
            {applying === 'display-off' ? '끄는 중...' : '화면 끄기'}
          </button>
          <button
            className="rounded-lg border border-sky-600 px-4 py-2 text-sm text-sky-300 hover:bg-sky-900 disabled:opacity-60"
            onClick={() => void applyDisplayOn()}
            disabled={applying === 'display-on' || applying === 'display-off'}
          >
            {applying === 'display-on' ? '켜는 중...' : '화면 켜기'}
          </button>
        </div>
        <p className="mt-2 text-xs text-app-muted">슬라이더를 0%로 설정하거나 화면 끄기 버튼을 누르면 화면이 꺼집니다.</p>
      </article>

      {/* LED 제어 */}
      <article className="rounded-xl border border-app-border bg-app-soft p-4">
        <h3 className="mb-3 text-sm font-semibold">LED 제어</h3>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={ledColor}
            onChange={(e) => setLedColor(e.target.value)}
            className="h-10 w-16 cursor-pointer rounded border border-app-border bg-panel"
          />
          <span className="text-sm text-app-muted">{ledColor.toUpperCase()}</span>
          <button
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            onClick={() => void applyLed(ledColor)}
            disabled={applying === 'led'}
          >
            {applying === 'led' ? '적용 중...' : '색상 적용'}
          </button>
          <button
            className="rounded-lg border border-app-border px-4 py-2 text-sm hover:bg-panel disabled:opacity-60"
            onClick={() => { setLedColor('#000000'); void applyLed('#000000'); }}
            disabled={applying === 'led'}
          >
            OFF (끄기)
          </button>
        </div>
      </article>
    </section>
  );
}
