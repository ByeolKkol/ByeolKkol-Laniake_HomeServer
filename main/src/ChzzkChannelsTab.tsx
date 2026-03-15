import { useState } from 'react';
import type { Channel } from './types';
import { QUALITY_OPTIONS } from './chzzkUtils';

interface Props {
  channels: Channel[];
  channelQualityDrafts: Record<string, string>;
  setChannelQualityDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  savingChannel: boolean;
  onAddChannel: (id: string, name: string, quality: string) => void;
  onDeleteChannel: (id: string) => void;
  onToggleChannel: (channel: Channel) => void;
  onSaveChannelQuality: (channel: Channel, quality: string) => void;
  onManualRecord: (id: string) => void;
}

export default function ChzzkChannelsTab({
  channels, channelQualityDrafts, setChannelQualityDrafts, savingChannel,
  onAddChannel, onDeleteChannel, onToggleChannel, onSaveChannelQuality, onManualRecord,
}: Props) {
  const [newChannelId, setNewChannelId] = useState('');
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelQuality, setNewChannelQuality] = useState('best');

  const handleAdd = () => {
    onAddChannel(newChannelId.trim(), newChannelName.trim(), newChannelQuality);
    setNewChannelId('');
    setNewChannelName('');
    setNewChannelQuality('best');
  };

  return (
    <section>
      <div className="mb-4 grid gap-3 rounded-xl border border-app-border bg-app-soft p-4 md:grid-cols-4">
        <input
          value={newChannelId}
          onChange={(e) => setNewChannelId(e.target.value)}
          className="rounded-lg border border-app-border bg-panel px-3 py-2 text-sm outline-none focus:border-brand"
          placeholder="CHZZK Channel ID"
        />
        <input
          value={newChannelName}
          onChange={(e) => setNewChannelName(e.target.value)}
          className="rounded-lg border border-app-border bg-panel px-3 py-2 text-sm outline-none focus:border-brand"
          placeholder="Display name (optional)"
        />
        <select
          value={newChannelQuality}
          onChange={(e) => setNewChannelQuality(e.target.value)}
          className="rounded-lg border border-app-border bg-panel px-3 py-2 text-sm outline-none focus:border-brand"
        >
          {QUALITY_OPTIONS.map((q) => <option key={q} value={q}>{q}</option>)}
        </select>
        <button
          className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          onClick={handleAdd}
          disabled={savingChannel}
        >
          {savingChannel ? 'Adding...' : 'Add Channel'}
        </button>
      </div>
      <div className="space-y-3">
        {channels.map((channel) => (
          <article key={channel.channel_id} className="rounded-xl border border-app-border bg-app-soft p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{channel.name}</p>
                <p className="text-xs text-app-muted">{channel.channel_id} · Quality: {channel.quality}</p>
              </div>
              <div className="flex gap-2">
                <select
                  value={channelQualityDrafts[channel.channel_id] ?? channel.quality}
                  onChange={(e) => setChannelQualityDrafts((prev) => ({ ...prev, [channel.channel_id]: e.target.value }))}
                  className="rounded-lg border border-app-border bg-panel px-3 py-2 text-xs outline-none focus:border-brand"
                >
                  {QUALITY_OPTIONS.map((q) => <option key={q} value={q}>{q}</option>)}
                </select>
                <button
                  className="rounded-lg border border-app-border px-3 py-2 text-xs hover:bg-panel"
                  onClick={() => onSaveChannelQuality(channel, channelQualityDrafts[channel.channel_id] ?? channel.quality)}
                >
                  Save quality
                </button>
                <button
                  className={`rounded-lg px-3 py-2 text-xs font-medium ${channel.is_active ? 'bg-emerald-600/25 text-emerald-300' : 'bg-zinc-700 text-zinc-300'}`}
                  onClick={() => onToggleChannel(channel)}
                >
                  {channel.is_active ? 'Active' : 'Inactive'}
                </button>
                <button
                  className="rounded-lg border border-app-border px-3 py-2 text-xs hover:bg-panel"
                  onClick={() => onManualRecord(channel.channel_id)}
                >
                  Record now
                </button>
                <button
                  className="rounded-lg border border-rose-500/40 px-3 py-2 text-xs text-rose-300 hover:bg-rose-500/10"
                  onClick={() => onDeleteChannel(channel.channel_id)}
                >
                  Remove
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
