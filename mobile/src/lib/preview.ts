import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import type { BlockedUser, ChatMessage, Group, GroupMember, PendingUpload, Profile, SpotDetail, SpotPin } from '../types';
import { assertCleanText } from './wordFilter';

const USER_ID = 'preview-user';
const STORE_KEY = 'mcu-demo-v3';

const seedGroups: Group[] = [
  {
    id: 'crew-dtla',
    name: 'Tokyo Locals',
    inviteCode: 'TOKYO1',
    createdBy: USER_ID,
    createdAt: '2026-06-01T00:00:00.000Z',
    memberCount: 3,
    myRole: 'owner',
  },
];

const seedMembers: Record<string, GroupMember[]> = {
  'crew-dtla': [
    {
      userId: USER_ID,
      username: 'you',
      role: 'owner',
      joinedAt: '2026-06-01T00:00:00.000Z',
    },
    {
      userId: 'user-nina',
      username: 'nina',
      role: 'member',
      joinedAt: '2026-06-08T00:00:00.000Z',
    },
    {
      userId: 'user-jules',
      username: 'jules',
      role: 'member',
      joinedAt: '2026-06-12T00:00:00.000Z',
    },
  ],
};

const seedSpots: SpotDetail[] = [
  {
    id: 'spot-pershing',
    groupIds: ['crew-dtla'],
    name: 'Pershing Square ledges',
    address: '532 S Olive St, Los Angeles',
    latitude: 34.0483,
    longitude: -118.2513,
    createdAt: '2026-06-10T18:00:00.000Z',
    description:
      'Marble lines in a downtown plaza that show up in old clips. Saved to look at, not as a session guide.',
    createdBy: 'user-nina',
    createdByUsername: 'nina',
    media: [
      {
        id: 'media-1',
        mediaType: 'photo',
        url: 'https://images.unsplash.com/photo-1464983953574-0892a716854b?w=1200&q=80',
        createdAt: '2026-06-10T18:00:00.000Z',
      },
    ],
  },
  {
    id: 'spot-spring',
    groupIds: ['crew-dtla'],
    name: 'Spring Street stair',
    address: '3rd & Spring, Los Angeles',
    latitude: 34.0425,
    longitude: -118.2535,
    createdAt: '2026-06-14T21:00:00.000Z',
    description: 'A long public stair on Spring Street, often photographed. For looking.',
    createdBy: USER_ID,
    createdByUsername: 'you',
    media: [],
  },
  {
    id: 'spot-schoolyard',
    groupIds: ['crew-dtla'],
    name: '3rd & Hill plaza',
    address: 'Near 3rd & Hill, Los Angeles',
    latitude: 34.0405,
    longitude: -118.247,
    createdAt: '2026-06-18T16:30:00.000Z',
    description: 'Open ground and banks near 3rd & Hill. Documented for the shapes.',
    createdBy: 'user-jules',
    createdByUsername: 'jules',
    media: [],
  },
];

let groups: Group[] = seedGroups.map((g) => ({ ...g }));
let membersByGroup: Record<string, GroupMember[]> = JSON.parse(JSON.stringify(seedMembers));
let spots: SpotDetail[] = seedSpots.map((s) => ({ ...s, media: [...s.media] }));
let messagesByGroup: Record<string, ChatMessage[]> = {
  'crew-dtla': [
    {
      id: 'msg-nina-1',
      groupId: 'crew-dtla',
      userId: 'user-nina',
      username: 'nina',
      body: 'That marble line still looks the same.',
      createdAt: '2026-06-11T12:00:00.000Z',
    },
  ],
};
let previewUsername = 'you';
let blockedUsers: BlockedUser[] = [];
let hiddenMessages: string[] = [];
let hiddenSpots: string[] = [];

function pin(spot: SpotDetail): SpotPin {
  return {
    id: spot.id,
    groupIds: spot.groupIds ?? [],
    name: spot.name,
    address: spot.address,
    latitude: spot.latitude,
    longitude: spot.longitude,
    createdAt: spot.createdAt,
  };
}

async function persist() {
  await AsyncStorage.setItem(
    STORE_KEY,
    JSON.stringify({
      groups,
      membersByGroup,
      spots,
      messagesByGroup,
      previewUsername,
      blockedUsers,
      hiddenMessages,
      hiddenSpots,
    }),
  );
}

async function persistChatAsset(groupId: string, uri: string, mediaType: 'photo' | 'video') {
  const dirRoot = FileSystem.documentDirectory;
  if (!dirRoot) return uri;
  const id = `chatmedia-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const ext = uri.split('.').pop()?.toLowerCase();
  const safeExt = ext && /^[a-z0-9]{1,8}$/.test(ext) ? ext : mediaType === 'video' ? 'mp4' : 'jpg';
  const dir = `${dirRoot}chat-media/${groupId}/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  const dest = `${dir}${id}.${safeExt}`;
  await FileSystem.copyAsync({ from: uri, to: dest });
  return dest;
}

export async function initPreview() {
  const raw = await AsyncStorage.getItem(STORE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as {
      groups?: Group[];
      membersByGroup?: Record<string, GroupMember[]>;
      spots?: SpotDetail[];
      messagesByGroup?: Record<string, ChatMessage[]>;
      previewUsername?: string;
      blockedUsers?: BlockedUser[];
      hiddenMessages?: string[];
      hiddenSpots?: string[];
    };
    if (parsed.groups) groups = parsed.groups;
    if (parsed.membersByGroup) membersByGroup = parsed.membersByGroup;
    if (parsed.spots) {
      spots = parsed.spots.map((s) => ({
        ...s,
        groupIds:
          s.groupIds ??
          ('groupId' in s && typeof (s as { groupId?: string }).groupId === 'string'
            ? [(s as { groupId: string }).groupId]
            : []),
      }));
    }
    if (parsed.messagesByGroup) messagesByGroup = parsed.messagesByGroup;
    if (parsed.previewUsername) previewUsername = parsed.previewUsername;
    if (parsed.blockedUsers) blockedUsers = parsed.blockedUsers;
    if (parsed.hiddenMessages) hiddenMessages = parsed.hiddenMessages;
    if (parsed.hiddenSpots) hiddenSpots = parsed.hiddenSpots;
  } catch {
    // keep seed data if storage is corrupt
  }
}

export const previewUserId = USER_ID;

export const previewApi = {
  getGroups: async () => ({ groups: [...groups] }),

  createGroup: async (name: string) => {
    const group: Group = {
      id: `group-${Date.now()}`,
      name,
      inviteCode: Math.random().toString(36).slice(2, 10).toUpperCase(),
      createdBy: USER_ID,
      createdAt: new Date().toISOString(),
      memberCount: 1,
      myRole: 'owner',
    };
    groups.push(group);
    membersByGroup[group.id] = [
      {
        userId: USER_ID,
        username: previewUsername,
        role: 'owner',
        joinedAt: group.createdAt,
      },
    ];
    await persist();
    return { group };
  },

  joinGroup: async (inviteCode: string) => {
    const group = groups.find((g) => g.inviteCode.toLowerCase() === inviteCode.toLowerCase());
    if (!group) {
      throw new Error('No group with that invite code');
    }
    return { group: { id: group.id, name: group.name, inviteCode: group.inviteCode } };
  },

  getGroupMembers: async (groupId: string) => ({
    members: membersByGroup[groupId] ?? [],
  }),

  leaveGroup: async (groupId: string) => {
    const index = groups.findIndex((g) => g.id === groupId);
    if (index >= 0) groups.splice(index, 1);
    delete membersByGroup[groupId];
    delete messagesByGroup[groupId];
    await persist();
  },

  getMessages: async (groupId: string) => {
    const blocked = new Set(blockedUsers.map((b) => b.userId));
    const hidden = new Set(hiddenMessages);
    return {
      messages: (messagesByGroup[groupId] ?? []).filter(
        (m) => !blocked.has(m.userId) && !hidden.has(m.id),
      ),
    };
  },

  sendMessage: async (
    groupId: string,
    input: { body?: string; assets?: { uri: string; mediaType: 'photo' | 'video'; mimeType?: string | null }[] },
  ) => {
    const text = input.body?.trim() ?? '';
    const assets = input.assets ?? [];
    const media = await Promise.all(
      assets.map(async (asset) => ({
        url: await persistChatAsset(groupId, asset.uri, asset.mediaType),
        mediaType: asset.mediaType,
      })),
    );
    if (!text && media.length === 0) throw new Error('Message is empty');
    if (text) assertCleanText(text, 'Message');
    const message: ChatMessage = {
      id: `msg-${Date.now()}`,
      groupId,
      userId: USER_ID,
      username: previewUsername,
      body: text,
      createdAt: new Date().toISOString(),
      media,
      imageUrl: media[0]?.url,
    };
    messagesByGroup[groupId] = [...(messagesByGroup[groupId] ?? []), message];
    await persist();
    return { message };
  },

  getSpots: async (groupId?: string) => {
    const blocked = new Set(blockedUsers.map((b) => b.userId));
    const hidden = new Set(hiddenSpots);
    return {
      spots: spots
        .filter((s) => (groupId ? (s.groupIds ?? []).includes(groupId) : true))
        .filter((s) => !hidden.has(s.id) && (s.createdBy === USER_ID || !blocked.has(s.createdBy)))
        .map(pin),
    };
  },

  getSpot: async (spotId: string) => {
    const spot = spots.find((s) => s.id === spotId);
    if (!spot) throw new Error('Spot not found');
    const blocked = new Set(blockedUsers.map((b) => b.userId));
    if (hiddenSpots.includes(spot.id) || (spot.createdBy !== USER_ID && blocked.has(spot.createdBy))) {
      throw new Error('Spot not found');
    }
    return { spot };
  },

  createSpot: async (input: {
    groupIds?: string[];
    name: string;
    description: string;
    address: string;
    latitude: number;
    longitude: number;
  }) => {
    assertCleanText(input.name, 'Name');
    if (input.description) assertCleanText(input.description, 'Notes');
    const spot: SpotDetail = {
      id: `spot-${Date.now()}`,
      groupIds: input.groupIds ?? [],
      name: input.name,
      address: input.address,
      latitude: input.latitude,
      longitude: input.longitude,
      createdAt: new Date().toISOString(),
      description: input.description,
      createdBy: USER_ID,
      createdByUsername: 'you',
      media: [],
    };
    spots.unshift(spot);
    await persist();
    return { spot: { id: spot.id } };
  },

  registerSpotMedia: async (): Promise<PendingUpload> => {
    throw new Error('Media uploads are disabled in this web preview');
  },

  attachLocalMedia: async (
    spotId: string,
    asset: { uri: string; type?: string | null; fileName?: string | null },
  ) => {
    const spot = spots.find((s) => s.id === spotId);
    if (!spot) throw new Error('Spot not found');

    const mediaType = asset.type === 'video' ? 'video' : 'photo';
    const fromName = asset.fileName?.split('.').pop();
    const fromUri = asset.uri.split('.').pop();
    const ext =
      fromName && /^[a-zA-Z0-9]{1,8}$/.test(fromName)
        ? fromName.toLowerCase()
        : fromUri && /^[a-zA-Z0-9]{1,8}$/.test(fromUri)
          ? fromUri.toLowerCase()
          : mediaType === 'video'
            ? 'mp4'
            : 'jpg';

    const id = `media-${Date.now()}`;
    const dir = `${FileSystem.documentDirectory}spot-media/${spotId}/`;
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    const dest = `${dir}${id}.${ext}`;
    await FileSystem.copyAsync({ from: asset.uri, to: dest });

    spot.media.push({
      id,
      mediaType,
      url: dest,
      createdAt: new Date().toISOString(),
    });
    await persist();
  },

  deleteSpot: async (spotId: string) => {
    const index = spots.findIndex((s) => s.id === spotId);
    if (index >= 0) spots.splice(index, 1);
    await persist();
  },

  getMe: async () => ({
    profile: {
      id: USER_ID,
      username: previewUsername,
      createdAt: '2026-06-01T00:00:00.000Z',
    } satisfies Profile,
  }),

  updateUsername: async (username: string) => {
    const next = username.trim();
    if (next.length < 2 || next.length > 32 || !/^[a-zA-Z0-9_]+$/.test(next)) {
      throw new Error('Use 2–32 letters, numbers, and underscores');
    }
    previewUsername = next;
    for (const members of Object.values(membersByGroup)) {
      for (const member of members) {
        if (member.userId === USER_ID) member.username = next;
      }
    }
    for (const list of Object.values(messagesByGroup)) {
      for (const message of list) {
        if (message.userId === USER_ID) message.username = next;
      }
    }
    for (const spot of spots) {
      if (spot.createdBy === USER_ID) spot.createdByUsername = next;
    }
    await persist();
    return {
      profile: { id: USER_ID, username: next, createdAt: '2026-06-01T00:00:00.000Z' },
    };
  },

  report: async (input: {
    contentType: 'message' | 'spot' | 'user';
    contentId?: string;
    targetUserId?: string;
    reason: 'inappropriate' | 'harassment' | 'spam' | 'other';
  }) => {
    if (input.contentType === 'message' && input.contentId) {
      if (!hiddenMessages.includes(input.contentId)) hiddenMessages.push(input.contentId);
    }
    if (input.contentType === 'spot' && input.contentId) {
      if (!hiddenSpots.includes(input.contentId)) hiddenSpots.push(input.contentId);
    }
    await persist();
    return { ok: true as const };
  },

  getBlocks: async () => ({ blocks: [...blockedUsers] }),

  blockUser: async (userId: string) => {
    if (userId === USER_ID) throw new Error('You cannot block yourself');
    const member = Object.values(membersByGroup)
      .flat()
      .find((m) => m.userId === userId);
    const username = member?.username ?? 'unknown';
    if (!blockedUsers.some((b) => b.userId === userId)) {
      blockedUsers.push({
        userId,
        username,
        createdAt: new Date().toISOString(),
      });
      await persist();
    }
    return { block: { userId, username } };
  },

  unblockUser: async (userId: string) => {
    blockedUsers = blockedUsers.filter((b) => b.userId !== userId);
    await persist();
  },

  deleteMe: async () => {
    groups = [];
    membersByGroup = {};
    spots = [];
    messagesByGroup = {};
    blockedUsers = [];
    hiddenMessages = [];
    hiddenSpots = [];
    await persist();
  },
};
