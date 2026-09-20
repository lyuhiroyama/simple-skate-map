import * as FileSystem from 'expo-file-system/legacy';
import type { ImagePickerAsset } from 'expo-image-picker';
import { isDemo } from '../config';
import { api } from './api';
import { previewApi } from './preview';

function extensionFor(asset: ImagePickerAsset): string {
  const fromName = asset.fileName?.split('.').pop();
  if (fromName && /^[a-zA-Z0-9]{1,8}$/.test(fromName)) return fromName.toLowerCase();
  const fromUri = asset.uri.split('.').pop();
  if (fromUri && /^[a-zA-Z0-9]{1,8}$/.test(fromUri)) return fromUri.toLowerCase();
  return asset.type === 'video' ? 'mp4' : 'jpg';
}

/**
 * Registers the media with the API, then uploads the file bytes straight
 * to Supabase Storage using the signed upload URL.
 */
export async function uploadSpotAsset(spotId: string, asset: ImagePickerAsset): Promise<void> {
  if (isDemo) {
    await previewApi.attachLocalMedia(spotId, asset);
    return;
  }

  const mediaType = asset.type === 'video' ? 'video' : 'photo';
  const ext = extensionFor(asset);

  const { media } = await api.registerSpotMedia(spotId, mediaType, ext);

  const result = await FileSystem.uploadAsync(media.uploadUrl, asset.uri, {
    httpMethod: 'PUT',
    headers: {
      'Content-Type': asset.mimeType ?? (mediaType === 'video' ? 'video/mp4' : 'image/jpeg'),
    },
  });

  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Upload failed with status ${result.status}`);
  }
}
