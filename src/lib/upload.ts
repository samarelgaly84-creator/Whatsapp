import { getAuthHeader } from './firebase';

export interface UploadedPublicMedia {
  url: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface UploadedCloudFile {
  storageKey: string;
  downloadUrl: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

export async function uploadPublicMedia(file: File): Promise<UploadedPublicMedia> {
  const headers = await getAuthHeader();
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/media/upload', {
    method: 'POST',
    headers,
    body: form,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Media upload failed');
  }
  return data;
}

export async function uploadCloudFile(file: File): Promise<UploadedCloudFile> {
  const headers = await getAuthHeader();
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/cloud/upload', {
    method: 'POST',
    headers,
    body: form,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Cloud file upload failed');
  }
  return data;
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / Math.pow(1024, i);
  return `${val >= 100 ? val.toFixed(0) : val.toFixed(1)} ${units[i]}`;
}

export function formatTimeAgo(dateMs?: number, lang: 'ar' | 'en' = 'ar'): string {
  if (!dateMs) return lang === 'ar' ? 'الآن' : 'just now';
  const diffSec = Math.max(0, Math.floor((Date.now() - dateMs) / 1000));
  if (diffSec < 60) return lang === 'ar' ? 'الآن' : 'just now';
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return lang === 'ar' ? `منذ ${mins} د` : `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return lang === 'ar' ? `منذ ${hrs} س` : `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return lang === 'ar' ? `منذ ${days} ي` : `${days}d ago`;
  return new Date(dateMs).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US');
}
