import { config, isDemo } from '../config';
import { previewApi } from './preview';
import { supabase } from './supabase';
import * as FileSystem from 'expo-file-system/legacy';
import { AppState } from 'react-native';
import type { BlockedUser, ChatMessage, Group, GroupMember, MessageReaction, PendingUpload, Profile, SpotDetail, SpotPin } from '../types';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function cleanErrorMessage(raw: string, status: number): string {
  const text = raw.trim();
  if (!text || text.length > 240 || /<!DOCTYPE|<html|SSL handshake|cloudflare/i.test(text)) {
    return status >= 500
      ? 'Could not reach the server. Try again in a moment.'
      : `Request failed (${status})`;
  }
  return text;
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
    throw new ApiError(cleanErrorMessage(message, res.status), res.status);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

const CACHE_TTL_MS = 20_000;
const cache = new Map<string, { at: number; value: unknown }>();

function readCache<T>(key: string): T | undefined {
  const hit = cache.get(key);
  if (!hit || Date.now() - hit.at > CACHE_TTL_MS) return undefined;
  return hit.value as T;
}

function writeCache<T>(key: string, value: T): T {
  cache.set(key, { at: Date.now(), value });
  return value;
}

function invalidateCache(...keys: string[]) {
  if (keys.length === 0) {
    cache.clear();
    return;
  }
  for (const key of [...cache.keys()]) {
    if (keys.some((k) => key === k || key.startsWith(`${k}:`))) cache.delete(key);
  }
}

async function retryTransient<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      const status = err instanceof ApiError ? err.status : 0;
      const message = err instanceof Error ? err.message : '';
      const transient =
        status >= 500 ||
        status === 0 ||
        /Could not reach the server|SSL handshake|network/i.test(message);
      if (i === attempts - 1 || (status > 0 && status < 500) || !transient) throw err;
      await new Promise((resolve) => setTimeout(resolve, 400 * (i + 1)));
    }
  }
  throw last;
}

async function cachedRequest<T>(key: string, path: string, init?: RequestInit): Promise<T> {
  if (!init?.method || init.method === 'GET') {
    const hit = readCache<T>(key);
    if (hit !== undefined) return hit;
  }
  const value = await request<T>(path, init);
  return writeCache(key, value);
}

const liveApi = {
  getGroups: () => cachedRequest<{ groups: Group[] }>('groups', '/groups'),

  createGroup: async (name: string) => {
    const result = await request<{ group: Group }>('/groups', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    invalidateCache('groups');
    return result;
  },

  joinGroup: async (inviteCode: string) => {
    const result = await request<{ group: Pick<Group, 'id' | 'name' | 'inviteCode'> }>('/groups/join', {
      method: 'POST',
      body: JSON.stringify({ inviteCode }),
    });
    invalidateCache('groups', 'spots');
    return result;
  },

  getGroupMembers: (groupId: string) =>
    request<{ members: GroupMember[] }>(`/groups/${groupId}/members`),

  removeGroupMember: (groupId: string, userId: string) =>
    request<void>(`/groups/${groupId}/members/${userId}`, { method: 'DELETE' }),

  leaveGroup: async (groupId: string) => {
    const result = await request<void>(`/groups/${groupId}/membership`, { method: 'DELETE' });
    invalidateCache('groups', 'spots');
    return result;
  },

  getMessages: (groupId: string) =>
    request<{ messages: ChatMessage[] }>(`/groups/${groupId}/messages`),

  getUnread: () => request<{ groupIds: string[] }>('/groups/unread'),

  markGroupRead: (groupId: string) =>
    request<void>(`/groups/${groupId}/read`, { method: 'POST' }),

  reactToMessage: (groupId: string, messageId: string, emoji: string) =>
    request<{ reactions: MessageReaction[] }>(
      `/groups/${groupId}/messages/${messageId}/reactions`,
      { method: 'POST', body: JSON.stringify({ emoji }) },
    ),

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
    cachedRequest<{ spots: SpotPin[] }>(groupId ? `spots:${groupId}` : 'spots', groupId ? `/spots?groupId=${groupId}` : '/spots'),

  getSpot: (spotId: string) => request<{ spot: SpotDetail }>(`/spots/${spotId}`),

  createSpot: async (input: {
    groupIds?: string[];
    name: string;
    description: string;
    address: string;
    latitude: number;
    longitude: number;
  }) => {
    const result = await request<{ spot: { id: string } }>('/spots', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    invalidateCache('spots');
    return result;
  },

  updateSpotShares: async (spotId: string, groupIds: string[]) => {
    const result = await retryTransient(() =>
      request<{ spot: { id: string; groupIds: string[] } }>(`/spots/${spotId}`, {
        method: 'PATCH',
        body: JSON.stringify({ groupIds }),
      }),
    );
    invalidateCache('spots');
    return result;
  },

  sendSpot: async (spotId: string, input: { groupIds: string[]; body?: string }) => {
    const result = await request<{ ok: true; groupIds: string[] }>(`/spots/${spotId}/send`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    invalidateCache('spots');
    return result;
  },

  registerSpotMedia: (spotId: string, mediaType: 'photo' | 'video', fileExtension: string) =>
    request<PendingUpload>(`/spots/${spotId}/media`, {
      method: 'POST',
      body: JSON.stringify({ mediaType, fileExtension }),
    }),

  deleteSpot: async (spotId: string) => {
    const result = await request<void>(`/spots/${spotId}`, { method: 'DELETE' });
    invalidateCache('spots');
    return result;
  },

  getMe: () => cachedRequest<{ profile: Profile }>('me', '/me'),

  updateUsername: async (username: string) => {
    const result = await request<{ profile: Profile }>('/me', {
      method: 'PATCH',
      body: JSON.stringify({ username }),
    });
    invalidateCache('me');
    return result;
  },

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

  blockUser: async (userId: string) => {
    const result = await request<{ block: { userId: string; username: string } }>('/blocks', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
    invalidateCache();
    return result;
  },

  unblockUser: (userId: string) => request<void>(`/blocks/${userId}`, { method: 'DELETE' }),

  deleteMe: () => request<void>('/me', { method: 'DELETE' }),
};

export const api = isDemo ? previewApi : liveApi;

/** Wake a sleeping API instance before the first signed-in request. */
export function wakeApi() {
  if (isDemo) return;
  void fetch(`${config.apiUrl}/health`).catch(() => undefined);
}

/** Keep the API from sleeping while the app is open. */
export function startApiKeepAlive() {
  if (isDemo) return () => undefined;
  wakeApi();
  const tick = setInterval(wakeApi, 4 * 60 * 1000);
  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'active') wakeApi();
  });
  return () => {
    clearInterval(tick);
    sub.remove();
  };
}
