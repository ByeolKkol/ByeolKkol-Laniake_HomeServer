import { useEffect, useState } from 'react';
import {
  type WolTarget,
  type WolTargetCreate,
  createTarget,
  deleteTarget,
  fetchPowerStatus,
  fetchTargets,
  rebootTarget,
  shutdownTarget,
  updateTarget,
  wakeTarget,
} from './wolApi';

const EMPTY_FORM: WolTargetCreate = {
  name: '',
  mac: '',
  ip: '',
  ssh_port: 22,
  ssh_user: '',
  ssh_password: '',
  os_type: 'windows',
};

const OS_LABEL: Record<string, string> = {
  windows: 'Windows',
  linux: 'Linux',
  synology: 'Synology',
};

function StatusDot({ online }: { online: boolean | null }) {
  if (online === null) return <span className="inline-block h-2.5 w-2.5 rounded-full bg-zinc-500" title="확인 불가" />;
  return online
    ? <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-400" title="온라인" />
    : <span className="inline-block h-2.5 w-2.5 rounded-full bg-rose-500" title="오프라인" />;
}

function TargetForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: WolTargetCreate;
  onSave: (data: WolTargetCreate) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<WolTargetCreate>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (key: keyof WolTargetCreate, value: string | number) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async () => {
    setSaving(true);
    setError('');
    try {
      await onSave(form);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-rose-400">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-app-muted">이름 *</label>
          <input className="w-full rounded-lg border border-app-border bg-panel px-3 py-2 text-sm" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Gaming PC" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-app-muted">MAC 주소 *</label>
          <input className="w-full rounded-lg border border-app-border bg-panel px-3 py-2 text-sm font-mono" value={form.mac} onChange={(e) => set('mac', e.target.value)} placeholder="AA:BB:CC:DD:EE:FF" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-app-muted">IP 주소</label>
          <input className="w-full rounded-lg border border-app-border bg-panel px-3 py-2 text-sm font-mono" value={form.ip ?? ''} onChange={(e) => set('ip', e.target.value)} placeholder="192.168.1.10" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-app-muted">SSH 포트</label>
          <input className="w-full rounded-lg border border-app-border bg-panel px-3 py-2 text-sm" type="number" value={form.ssh_port} onChange={(e) => set('ssh_port', Number(e.target.value))} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-app-muted">SSH 유저</label>
          <input className="w-full rounded-lg border border-app-border bg-panel px-3 py-2 text-sm" value={form.ssh_user ?? ''} onChange={(e) => set('ssh_user', e.target.value)} placeholder="username" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-app-muted">SSH 비밀번호</label>
          <input className="w-full rounded-lg border border-app-border bg-panel px-3 py-2 text-sm" type="password" value={form.ssh_password ?? ''} onChange={(e) => set('ssh_password', e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-app-muted">운영체제</label>
          <select className="w-full rounded-lg border border-app-border bg-panel px-3 py-2 text-sm" value={form.os_type ?? 'linux'} onChange={(e) => set('os_type', e.target.value)}>
            <option value="windows">Windows</option>
            <option value="linux">Linux</option>
            <option value="synology">Synology</option>
          </select>
        </div>
      </div>
      <div className="flex gap-2">
        <button className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60" onClick={() => void handleSubmit()} disabled={saving || !form.name || !form.mac}>
          {saving ? '저장 중...' : '저장'}
        </button>
        <button className="rounded-lg border border-app-border px-4 py-2 text-sm hover:bg-panel" onClick={onCancel}>취소</button>
      </div>
    </div>
  );
}

function TargetCard({
  target,
  onEdit,
  onDeleted,
}: {
  target: WolTarget;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const [online, setOnline] = useState<boolean | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    const check = () => {
      void fetchPowerStatus(target.id)
        .then((s) => { if (alive) setOnline(s.online); })
        .catch(() => { if (alive) setOnline(null); });
    };
    check();
    const id = window.setInterval(check, 5000);
    return () => { alive = false; window.clearInterval(id); };
  }, [target.id]);

  const act = async (label: string, fn: () => Promise<void>) => {
    setActing(label);
    setError('');
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setActing(null); }
  };

  const hasSsh = !!(target.ip && target.ssh_user && target.ssh_password);

  return (
    <article className="rounded-xl border border-app-border bg-app-soft p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <StatusDot online={online} />
          <span className="font-semibold">{target.name}</span>
          <span className="text-xs text-app-muted">{online === true ? '온라인' : online === false ? '오프라인' : '알 수 없음'}</span>
        </div>
        <div className="flex gap-1">
          <button className="rounded px-2 py-1 text-xs text-app-muted hover:bg-panel" onClick={onEdit}>편집</button>
          <button className="rounded px-2 py-1 text-xs text-rose-400 hover:bg-rose-500/10" onClick={() => void act('delete', async () => { await deleteTarget(target.id); onDeleted(); })}>삭제</button>
        </div>
      </div>
      <div className="mt-1 space-y-0.5 text-xs text-app-muted">
        <p>MAC: <span className="font-mono">{target.mac}</span>
          <span className="ml-2 rounded px-1.5 py-0.5 bg-zinc-700 text-zinc-300">{OS_LABEL[target.os_type] ?? target.os_type}</span>
        </p>
        {target.ip && <p>IP: <span className="font-mono">{target.ip}</span>{target.ssh_user && ` / SSH: ${target.ssh_user}@${target.ip}:${target.ssh_port}`}</p>}
      </div>
      {error && <p className="mt-2 text-xs text-rose-400">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
          onClick={() => void act('wake', () => wakeTarget(target.id))}
          disabled={acting !== null}
        >
          {acting === 'wake' ? '전송 중...' : '켜기'}
        </button>
        {hasSsh && (
          <>
            <button
              className="rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700 disabled:opacity-60"
              onClick={() => void act('shutdown', () => shutdownTarget(target.id))}
              disabled={acting !== null}
            >
              {acting === 'shutdown' ? '종료 중...' : '끄기'}
            </button>
            <button
              className="rounded-lg border border-sky-600 px-4 py-2 text-sm text-sky-300 hover:bg-sky-900 disabled:opacity-60"
              onClick={() => void act('reboot', () => rebootTarget(target.id))}
              disabled={acting !== null}
            >
              {acting === 'reboot' ? '재시작 중...' : '재시작'}
            </button>
          </>
        )}
      </div>
    </article>
  );
}

export default function WolTab() {
  const [targets, setTargets] = useState<WolTarget[]>([]);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const refresh = () => {
    void fetchTargets()
      .then(setTargets)
      .catch((e: Error) => setError(e.message));
  };

  useEffect(() => { refresh(); }, []);

  const handleAdd = async (data: WolTargetCreate) => {
    await createTarget(data);
    refresh();
    setShowAdd(false);
  };

  const handleEdit = async (id: string, data: WolTargetCreate) => {
    await updateTarget(id, data);
    refresh();
    setEditingId(null);
  };

  return (
    <section className="space-y-4">
      {error && (
        <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-app-muted">등록된 PC ({targets.length})</h2>
        {!showAdd && (
          <button className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white" onClick={() => setShowAdd(true)}>
            + PC 추가
          </button>
        )}
      </div>

      {showAdd && (
        <article className="rounded-xl border border-app-border bg-app-soft p-4">
          <h3 className="mb-3 text-sm font-semibold">새 PC 추가</h3>
          <TargetForm initial={EMPTY_FORM} onSave={handleAdd} onCancel={() => setShowAdd(false)} />
        </article>
      )}

      {targets.length === 0 && !showAdd && (
        <p className="py-8 text-center text-sm text-app-muted">등록된 PC가 없습니다.</p>
      )}

      {targets.map((t) =>
        editingId === t.id ? (
          <article key={t.id} className="rounded-xl border border-app-border bg-app-soft p-4">
            <h3 className="mb-3 text-sm font-semibold">PC 편집</h3>
            <TargetForm
              initial={{ name: t.name, mac: t.mac, ip: t.ip ?? '', ssh_port: t.ssh_port, ssh_user: t.ssh_user ?? '', ssh_password: t.ssh_password ?? '', os_type: t.os_type }}
              onSave={(data) => handleEdit(t.id, data)}
              onCancel={() => setEditingId(null)}
            />
          </article>
        ) : (
          <TargetCard key={t.id} target={t} onEdit={() => setEditingId(t.id)} onDeleted={refresh} />
        )
      )}
    </section>
  );
}
