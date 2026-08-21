import api from './api';
import { resolvePublicUrl } from './urls';

export interface ReusableAsset {
  id: string | number;
  name: string;
  type: 'overlay' | 'sticker' | 'logo' | string;
  url: string;
  mime_type?: string;
  file_size?: number;
  is_active?: boolean;
  created_at?: string;
}

export const resolveAssetUrl = (url?: string | null) => {
  if (!url) return '';
  return resolvePublicUrl(url);
};

export const normalizeAsset = (raw: any): ReusableAsset => ({
  id: raw.id,
  name: raw.name || raw.original_name || 'Untitled asset',
  type: raw.type || raw.asset_type || 'overlay',
  url: resolveAssetUrl(raw.url || raw.image_url || raw.file_url || ''),
  mime_type: raw.mime_type || raw.mimeType,
  file_size: raw.file_size || raw.fileSize,
  is_active: raw.is_active ?? true,
  created_at: raw.created_at || raw.createdAt,
});

export async function fetchReusableAssets(type = 'logo') {
  const response = await api.get('/admin/assets', { params: { type } });
  const data = response.data?.data || response.data;
  return Array.isArray(data) ? data.map(normalizeAsset) : [];
}

export async function uploadReusableAsset(file: File, name: string, type = 'overlay') {
  const form = new FormData();
  form.append('asset', file);
  form.append('name', name.trim() || file.name.replace(/\.[^.]+$/, ''));
  form.append('type', type);
  const response = await api.post('/admin/assets', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return normalizeAsset(response.data?.data || response.data);
}

export async function deleteReusableAsset(id: string | number) {
  await api.delete(`/admin/assets/${id}`);
}
