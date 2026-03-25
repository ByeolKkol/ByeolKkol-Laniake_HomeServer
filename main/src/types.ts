export type HealthResponse = {
  healthy: boolean;
  scanner_running?: boolean;
  active_recordings?: number;
};

export interface HealthState {
  healthy: boolean;
  scanner_running?: boolean;
  active_recordings?: number;
  disk_free_bytes?: number | null;
  disk_total_bytes?: number | null;
  disk_used_percent?: number | null;
}

export type Channel = {
  id: number;
  channel_id: string;
  name: string;
  quality: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type Recording = {
  id: number;
  channel_id: number | null;
  display_name: string | null;
  stream_id: string | null;
  title: string | null;
  file_path: string;
  file_size_bytes: number | null;
  duration_seconds: number | null;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  quality: string | null;
  thumbnail_url: string | null;
  upload_status: string | null;
};

export type ChannelsResponse = {
  items: Channel[];
  message?: string;
};

export type RecordingsResponse = {
  items: Recording[];
};

export type CookieResponse = {
  item: {
    configured: boolean;
    nid_aut_masked: string | null;
    nid_ses_masked: string | null;
    updated_at: string | null;
  };
};

export type RecordStartResponse = {
  message: string;
  recording_id?: number;
};

export type UploadLog = {
  id: number;
  recording_id: number;
  destination: string;
  status: string;
  progress_percent: number | null;
  bytes_uploaded: number | null;
  bytes_total: number | null;
  message: string | null;
  drive_file_id: string | null;
  drive_file_url: string | null;
  started_at: string | null;
  uploaded_at: string | null;
  updated_at: string | null;
  created_at: string;
};

export type UploadStatusResponse = {
  items: UploadLog[];
  active_uploads: number;
  runtime: Array<{
    upload_log_id: number;
    recording_id: number;
    status: string;
    message?: string;
    progress_percent?: number | null;
    bytes_uploaded?: number | null;
    bytes_total?: number | null;
    updated_at?: string;
  }>;
};

export type GoogleDriveSettings = {
  connected: boolean;
  credentials_exists: boolean;
  settings_exists: boolean;
  session_exists: boolean;
  credential_type: string;
  credentials_path: string;
  settings_path: string;
  session_path: string;
  detail: string;
};

export type GoogleDriveSettingsResponse = {
  item: GoogleDriveSettings;
};
