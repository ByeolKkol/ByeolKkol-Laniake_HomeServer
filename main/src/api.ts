import type {
  Channel,
  ChannelsResponse,
  CookieResponse,
  GoogleDriveSettingsResponse,
  HealthResponse,
  RecordingsResponse,
  RecordStartResponse,
  UploadStatusResponse
} from './types';
import { getApiBase } from './settingsStore';

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with status ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch(`${getApiBase()}/health`);
  return parseJson<HealthResponse>(response);
}

export async function fetchChannels(): Promise<ChannelsResponse> {
  const response = await fetch(`${getApiBase()}/channels`);
  return parseJson<ChannelsResponse>(response);
}

export async function createChannel(payload: {
  channel_id: string;
  name?: string;
  quality?: string;
  is_active?: boolean;
}): Promise<{ item: Channel; message: string }> {
  const response = await fetch(`${getApiBase()}/channels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return parseJson(response);
}

export async function updateChannel(
  channelId: string,
  payload: { name?: string; quality?: string; is_active?: boolean }
): Promise<{ item: Channel; message: string }> {
  const response = await fetch(`${getApiBase()}/channels/${channelId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return parseJson(response);
}

export async function deleteChannel(channelId: string): Promise<{ message: string }> {
  const response = await fetch(`${getApiBase()}/channels/${channelId}`, {
    method: 'DELETE'
  });
  return parseJson(response);
}

export async function fetchActiveRecordings(): Promise<RecordingsResponse> {
  const response = await fetch(`${getApiBase()}/recordings/active`);
  return parseJson(response);
}

export async function fetchRecordings(limit = 100): Promise<RecordingsResponse> {
  const response = await fetch(`${getApiBase()}/recordings?limit=${limit}`);
  return parseJson(response);
}

export async function deleteRecording(recordingId: number): Promise<{ message: string; file_deleted: boolean }> {
  const response = await fetch(`${getApiBase()}/recordings/${recordingId}`, {
    method: 'DELETE'
  });
  return parseJson(response);
}

export async function stopRecording(recordingId: number): Promise<{ message: string; recording_id: number }> {
  const response = await fetch(`${getApiBase()}/recordings/${recordingId}/stop`, {
    method: 'POST'
  });
  return parseJson(response);
}

export function buildThumbnailProxyUrl(url: string): string {
  return `${getApiBase()}/proxy/thumbnail?url=${encodeURIComponent(url)}`;
}

export async function startRecording(channelId?: string): Promise<RecordStartResponse> {
  const response = await fetch(`${getApiBase()}/recordings/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(channelId ? { channel_id: channelId } : {})
  });
  return parseJson<RecordStartResponse>(response);
}

export async function fetchCookies(): Promise<CookieResponse> {
  const response = await fetch(`${getApiBase()}/cookies`);
  return parseJson(response);
}

export async function saveCookies(payload: {
  nid_aut: string;
  nid_ses: string;
}): Promise<{ message: string }> {
  const response = await fetch(`${getApiBase()}/cookies`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return parseJson(response);
}

export async function fetchUploadStatus(): Promise<UploadStatusResponse> {
  const response = await fetch(`${getApiBase()}/upload/status`);
  return parseJson(response);
}

export async function deleteUploadLog(uploadLogId: number): Promise<{ message: string }> {
  const response = await fetch(`${getApiBase()}/upload/${uploadLogId}`, { method: 'DELETE' });
  return parseJson(response);
}

export async function retryRecordingUpload(recordingId: number): Promise<{ message: string }> {
  const response = await fetch(`${getApiBase()}/recordings/${recordingId}/retry-upload`, {
    method: 'POST'
  });
  return parseJson(response);
}

export async function fetchGoogleDriveSettings(): Promise<GoogleDriveSettingsResponse> {
  const response = await fetch(`${getApiBase()}/settings/google-drive`);
  return parseJson(response);
}

export async function uploadGoogleDriveCredentials(file: File): Promise<{ message: string; item: GoogleDriveSettingsResponse['item'] }> {
  const formData = new FormData();
  formData.append('credentials_file', file, 'credentials.json');

  const response = await fetch(`${getApiBase()}/settings/google-drive`, {
    method: 'POST',
    body: formData
  });
  return parseJson(response);
}
