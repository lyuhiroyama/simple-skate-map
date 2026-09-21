import { config, isDemo } from '../config';
import { previewApi } from './preview';
import { supabase } from './supabase';
import * as FileSystem from 'expo-file-system/legacy';
import type { BlockedUser, ChatMessage, Group, GroupMember, PendingUpload, Profile, SpotDetail, SpotPin } from '../types';

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new ApiError('Not signed in', 401);
  }

  const res = await fetch(`${config.apiUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // non-JSON error body; keep default message
    }
    throw new ApiError(message, res.status);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

const liveApi = {
  getGroups: () => request<{ groups: Group[] }>('/groups'),

  createGroup: (name: string) =>
    request<{ group: Group }>('/groups', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  joinGroup: (inviteCode: string) =>
    request<{ group: Pick<Group, 'id' | 'name' | 'inviteCode'> }>('/groups/join', {
      method: 'POST',
      body: JSON.stringify({ inviteCode }),
    }),

  getGroupMembers: (groupId: string) =>
    request<{ members: GroupMember[] }>(`/groups/${groupId}/members`),

  removeGroupMember: (groupId: string, userId: string) =>
    request<void>(`/groups/${groupId}/members/${userId}`, { method: 'DELETE' }),

  leaveGroup: (groupId: string) =>
    request<void>(`/groups/${groupId}/membership`, { method: 'DELETE' }),

  getMessages: (groupId: string) =>
    request<{ messages: ChatMessage[] }>(`/groups/${groupId}/messages`),

  sendMessage: async (
    groupId: string,
    input: { body?: string; assets?: { uri: string; mediaType: 'photo' | 'video'; mimeType?: string | null }[] },
  ) => {
    const assets = input.assets ?? [];
    const attachments = assets.map((asset) => {
      const fromUri = asset.uri.split('.').pop();
      const fileExtension =
        fromUri && /^[a-z0-9]{1,8}$/i.test(fromUri)
          ? fromUri.toLowerCase()
          : asset.mediaType === 'video'
            ? 'mp4'
            : 'jpg';
      return { fileExtension, mediaType: asset.mediaType };
    });
    const result = await request<{
      message: ChatMessage;
      uploads?: { uploadUrl: string; uploadToken: string; storagePath: string }[];
      upload?: { uploadUrl: string; uploadToken: string; storagePath: string };
    }>(`/groups/${groupId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        body: input.body,
        attachments: attachments.length > 0 ? attachments : undefined,
      }),
    });
    const uploads = result.uploads ?? (result.upload ? [result.upload] : []);
    const media: ChatMessage['media'] = [];
    for (let i = 0; i < uploads.length; i += 1) {
      const upload = uploads[i];
      const asset = assets[i];
      if (!upload || !asset) continue;
      const uploaded = await FileSystem.uploadAsync(upload.uploadUrl, asset.uri, {
        httpMethod: 'PUT',
        headers: {
          'Content-Type':
            asset.mimeType ?? (asset.mediaType === 'video' ? 'video/mp4' : 'image/jpeg'),
        },
      });
      if (uploaded.status < 200 || uploaded.status >= 300) {
        throw new ApiError(`Upload failed with status ${uploaded.status}`, uploaded.status);
      }
      media.push({ url: asset.uri, mediaType: asset.mediaType });
    }
    if (media.length > 0) {
      result.message.media = media;
      result.message.imageUrl = media[0]?.url;
    }
    return { message: result.message };
  },

  getSpots: (groupId?: string) =>
    request<{ spots: SpotPin[] }>(groupId ? `/spots?groupId=${groupId}` : '/spots'),

  getSpot: (spotId: string) => request<{ spot: SpotDetail }>(`/spots/${spotId}`),

  createSpot: (input: {
    groupIds?: string[];
    name: string;
    description: string;
    address: string;
    latitude: number;
    longitude: number;
  }) =>
    request<{ spot: { id: string } }>('/spots', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  updateSpotShares: (spotId: string, groupIds: string[]) =>
    request<{ spot: { id: string; groupIds: string[] } }>(`/spots/${spotId}`, {
      method: 'PATCH',
      body: JSON.stringify({ groupIds }),
    }),

  sendSpot: (spotId: string, input: { groupIds: string[]; body?: string }) =>
    request<{ ok: true; groupIds: string[] }>(`/spots/${spotId}/send`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  registerSpotMedia: (spotId: string, mediaType: 'photo' | 'video', fileExtension: string) =>
    request<PendingUpload>(`/spots/${spotId}/media`, {
      method: 'POST',
      body: JSON.stringify({ mediaType, fileExtension }),
    }),

  deleteSpot: (spotId: string) => request<void>(`/spots/${spotId}`, { method: 'DELETE' }),

  getMe: () => request<{ profile: Profile }>('/me'),

  updateUsername: (username: string) =>
    request<{ profile: Profile }>('/me', {
      method: 'PATCH',
      body: JSON.stringify({ username }),
    }),

  report: (input: {
    contentType: 'message' | 'spot' | 'user';
    contentId?: string;
    targetUserId?: string;
    reason: 'inappropriate' | 'harassment' | 'spam' | 'other';
  }) =>
    request<{ ok: true }>('/reports', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  getBlocks: () => request<{ blocks: BlockedUser[] }>('/blocks'),

  blockUser: (userId: string) =>
    request<{ block: { userId: string; username: string } }>('/blocks', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    }),

  unblockUser: (userId: string) => request<void>(`/blocks/${userId}`, { method: 'DELETE' }),

  deleteMe: () => request<void>('/me', { method: 'DELETE' }),
};

export const api = isDemo ? previewApi : liveApi;
