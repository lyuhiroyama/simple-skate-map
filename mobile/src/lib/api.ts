import { config, isDemo } from '../config';
import { previewApi } from './preview';
import { supabase } from './supabase';
import type { Group, GroupMember, PendingUpload, SpotDetail, SpotPin } from '../types';

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

  leaveGroup: (groupId: string) =>
    request<void>(`/groups/${groupId}/membership`, { method: 'DELETE' }),

  getSpots: (groupId?: string) =>
    request<{ spots: SpotPin[] }>(groupId ? `/spots?groupId=${groupId}` : '/spots'),

  getSpot: (spotId: string) => request<{ spot: SpotDetail }>(`/spots/${spotId}`),

  createSpot: (input: {
    groupId: string;
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

  registerSpotMedia: (spotId: string, mediaType: 'photo' | 'video', fileExtension: string) =>
    request<PendingUpload>(`/spots/${spotId}/media`, {
      method: 'POST',
      body: JSON.stringify({ mediaType, fileExtension }),
    }),

  deleteSpot: (spotId: string) => request<void>(`/spots/${spotId}`, { method: 'DELETE' }),
};

export const api = isDemo ? previewApi : liveApi;
