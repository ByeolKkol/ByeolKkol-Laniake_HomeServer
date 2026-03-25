import { useEffect, useMemo, useState } from 'react';
import {
  createChannel,
  deleteChannel,
  deleteRecording,
  deleteUploadLog,
  fetchActiveRecordings,
  fetchChannels,
  fetchCookies,
  fetchGoogleDriveSettings,
  fetchHealth,
  fetchRecordings,
  fetchUploadStatus,
  retryRecordingUpload,
  saveCookies,
  startRecording,
  stopRecording,
  updateChannel,
  uploadGoogleDriveCredentials,
  uploadGoogleDriveSession,
} from './api';
import type { Channel, GoogleDriveSettings, HealthState, Recording, UploadLog } from './types';

type CookieStatus = {
  configured: boolean;
  nid_aut_masked: string | null;
  nid_ses_masked: string | null;
  updated_at: string | null;
};

const INITIAL_DRIVE: GoogleDriveSettings = {
  connected: false, credentials_exists: false, settings_exists: false,
  session_exists: false, credential_type: 'missing',
  credentials_path: '', settings_path: '', session_path: '',
  detail: 'Google Drive is not configured',
};

const INITIAL_COOKIE: CookieStatus = {
  configured: false, nid_aut_masked: null, nid_ses_masked: null, updated_at: null,
};

export function useChzzkData() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [health, setHealth] = useState<HealthState | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeRecordings, setActiveRecordings] = useState<Recording[]>([]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [uploads, setUploads] = useState<UploadLog[]>([]);
  const [activeUploads, setActiveUploads] = useState(0);
  const [globalCookieStatus, setGlobalCookieStatus] = useState<CookieStatus>(INITIAL_COOKIE);
  const [googleDriveStatus, setGoogleDriveStatus] = useState<GoogleDriveSettings>(INITIAL_DRIVE);
  const [channelQualityDrafts, setChannelQualityDrafts] = useState<Record<string, string>>({});
  const [retryingRecordingId, setRetryingRecordingId] = useState<number | null>(null);
  const [deletingRecordingId, setDeletingRecordingId] = useState<number | null>(null);
  const [stoppingRecordingId, setStoppingRecordingId] = useState<number | null>(null);
  const [savingChannel, setSavingChannel] = useState(false);
  const [savingCookies, setSavingCookies] = useState(false);
  const [savingDriveCredentials, setSavingDriveCredentials] = useState(false);

  const activeChannelCount = useMemo(() => channels.filter((c) => c.is_active).length, [channels]);

  const refreshAll = async () => {
    setLoading(true);
    setMessage('');
    try {
      const [healthRes, channelRes, activeRecordingsRes, recordingsRes, cookieRes, uploadRes, driveRes] =
        await Promise.all([
          fetchHealth(), fetchChannels(), fetchActiveRecordings(),
          fetchRecordings(200), fetchCookies(), fetchUploadStatus(), fetchGoogleDriveSettings(),
        ]);
      setHealth(healthRes);
      const fetchedChannels = channelRes.items ?? [];
      setChannels(fetchedChannels);
      setChannelQualityDrafts(Object.fromEntries(fetchedChannels.map((ch) => [ch.channel_id, ch.quality || 'best'])));
      setActiveRecordings(activeRecordingsRes.items ?? []);
      setRecordings(recordingsRes.items ?? []);
      setGlobalCookieStatus(cookieRes.item);
      setUploads(uploadRes.items ?? []);
      setActiveUploads(uploadRes.active_uploads ?? 0);
      setGoogleDriveStatus(driveRes.item);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    const pollOnce = async () => {
      await Promise.all([
        fetchHealth().then((r) => { if (mounted) setHealth(r); }).catch((e) => console.warn('fetchHealth poll failed:', e)),
        fetchActiveRecordings().then((r) => { if (mounted) setActiveRecordings(r.items ?? []); }).catch((e) => console.warn('fetchActiveRecordings poll failed:', e)),
        fetchUploadStatus().then((r) => { if (mounted) { setUploads(r.items ?? []); setActiveUploads(r.active_uploads ?? 0); } }).catch((e) => console.warn('fetchUploadStatus poll failed:', e)),
        fetchRecordings(200).then((r) => { if (mounted) setRecordings(r.items ?? []); }).catch((e) => console.warn('fetchRecordings poll failed:', e)),
        fetchGoogleDriveSettings().then((r) => { if (mounted) setGoogleDriveStatus(r.item); }).catch((e) => console.warn('fetchGoogleDriveSettings poll failed:', e)),
      ]);
    };

    void refreshAll();
    const id = window.setInterval(() => void pollOnce(), 5000);
    return () => { mounted = false; window.clearInterval(id); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddChannel = async (channelId: string, name: string, quality: string) => {
    if (!channelId) return;
    setSavingChannel(true); setMessage('');
    try {
      await createChannel({ channel_id: channelId, name: name || channelId, quality, is_active: true });
      await refreshAll();
      setMessage('Channel added.');
    } catch (error) { setMessage((error as Error).message); }
    finally { setSavingChannel(false); }
  };

  const handleDeleteChannel = async (channelId: string) => {
    setMessage('');
    try { await deleteChannel(channelId); await refreshAll(); setMessage('Channel removed.'); }
    catch (error) { setMessage((error as Error).message); }
  };

  const handleToggleChannel = async (channel: Channel) => {
    setMessage('');
    try { await updateChannel(channel.channel_id, { is_active: !channel.is_active }); await refreshAll(); }
    catch (error) { setMessage((error as Error).message); }
  };

  const handleSaveChannelQuality = async (channel: Channel, quality: string) => {
    setMessage('');
    try { await updateChannel(channel.channel_id, { quality }); await refreshAll(); setMessage(`Quality updated for ${channel.name}.`); }
    catch (error) { setMessage((error as Error).message); }
  };

  const handleManualRecord = async (channelId: string) => {
    setMessage('');
    try { const result = await startRecording(channelId); setMessage(result.message); await refreshAll(); }
    catch (error) { setMessage((error as Error).message); }
  };

  const handleSaveCookies = async (nidAut: string, nidSes: string) => {
    if (!nidAut.trim() || !nidSes.trim()) { setMessage('NID_AUT and NID_SES are required.'); return; }
    setSavingCookies(true); setMessage('');
    try { await saveCookies({ nid_aut: nidAut.trim(), nid_ses: nidSes.trim() }); await refreshAll(); setMessage('Global account saved.'); }
    catch (error) { setMessage((error as Error).message); }
    finally { setSavingCookies(false); }
  };

  const handleUploadDriveCredentials = async (file: File) => {
    setSavingDriveCredentials(true); setMessage('');
    try { const result = await uploadGoogleDriveCredentials(file); setGoogleDriveStatus(result.item); await refreshAll(); setMessage('Google Drive credentials uploaded.'); }
    catch (error) { setMessage((error as Error).message); }
    finally { setSavingDriveCredentials(false); }
  };

  const handleRetryUpload = async (recordingId: number) => {
    setRetryingRecordingId(recordingId); setMessage('');
    try { const result = await retryRecordingUpload(recordingId); setMessage(result.message); await refreshAll(); }
    catch (error) { setMessage((error as Error).message); }
    finally { setRetryingRecordingId(null); }
  };

  const handleStopRecording = async (recordingId: number) => {
    if (!window.confirm(`Recording #${recordingId}을 중단하시겠습니까?`)) return;
    setStoppingRecordingId(recordingId); setMessage('');
    try { const result = await stopRecording(recordingId); setMessage(result.message); await refreshAll(); }
    catch (error) { setMessage((error as Error).message); }
    finally { setStoppingRecordingId(null); }
  };

  const handleDeleteRecording = async (recordingId: number) => {
    if (!window.confirm(`Delete recording #${recordingId}? This will also delete the file.`)) return;
    setDeletingRecordingId(recordingId); setMessage('');
    try {
      const result = await deleteRecording(recordingId);
      setMessage(result.file_deleted ? 'Recording and file deleted.' : 'Recording deleted. File was missing or could not be deleted.');
      await refreshAll();
    } catch (error) { setMessage((error as Error).message); }
    finally { setDeletingRecordingId(null); }
  };

  const handleBulkDeleteRecordings = async (ids: number[]): Promise<void> => {
    if (!window.confirm(`${ids.length}개 녹화를 삭제하시겠습니까? 파일도 함께 삭제됩니다.`)) return;
    setMessage('');
    try {
      await Promise.all(ids.map((id) => deleteRecording(id)));
      setMessage(`${ids.length}개 녹화가 삭제되었습니다.`);
      await refreshAll();
    } catch (error) { setMessage((error as Error).message); }
  };

  const handleBulkDeleteUploads = async (ids: number[]): Promise<void> => {
    if (!window.confirm(`${ids.length}개 업로드 로그를 삭제하시겠습니까?`)) return;
    setMessage('');
    try {
      await Promise.all(ids.map((id) => deleteUploadLog(id)));
      setMessage(`${ids.length}개 업로드 로그가 삭제되었습니다.`);
      await refreshAll();
    } catch (error) { setMessage((error as Error).message); }
  };

  const refreshDriveStatus = () => {
    fetchGoogleDriveSettings().then((r) => setGoogleDriveStatus(r.item)).catch((e) => console.warn('refreshDriveStatus failed:', e));
  };

  const handleUploadDriveSession = async (file: File) => {
    setSavingDriveCredentials(true); setMessage('');
    try {
      const result = await uploadGoogleDriveSession(file);
      setGoogleDriveStatus(result.item);
      setMessage('Google Drive session uploaded.');
    } catch (error) { setMessage((error as Error).message); }
    finally { setSavingDriveCredentials(false); }
  };

  return {
    loading, message, health, channels, activeRecordings, recordings, uploads, activeUploads,
    globalCookieStatus, googleDriveStatus, channelQualityDrafts, setChannelQualityDrafts,
    activeChannelCount, retryingRecordingId, deletingRecordingId, stoppingRecordingId,
    savingChannel, savingCookies, savingDriveCredentials,
    refreshAll, refreshDriveStatus,
    handleAddChannel, handleDeleteChannel, handleToggleChannel, handleSaveChannelQuality,
    handleManualRecord, handleSaveCookies, handleUploadDriveCredentials, handleUploadDriveSession,
    handleRetryUpload, handleStopRecording, handleDeleteRecording,
    handleBulkDeleteRecordings, handleBulkDeleteUploads,
  };
}
