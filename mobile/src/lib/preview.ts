import type { Group, GroupMember, PendingUpload, SpotDetail, SpotPin } from '../types';

const USER_ID = 'preview-user';

const groups: Group[] = [
  {
    id: 'crew-dtla',
    name: 'Downtown Shredders',
    inviteCode: 'SHRED1',
    createdBy: USER_ID,
    createdAt: '2026-06-01T00:00:00.000Z',
    memberCount: 3,
    myRole: 'owner',
  },
];

const membersByGroup: Record<string, GroupMember[]> = {
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

const spots: SpotDetail[] = [
  {
    id: 'spot-pershing',
    groupId: 'crew-dtla',
    name: 'Pershing Square ledges',
    address: '532 S Olive St, Los Angeles',
    latitude: 34.0483,
    longitude: -118.2513,
    createdAt: '2026-06-10T18:00:00.000Z',
    description: 'Marble ledges and a bump to bar. Security cycles through after 8. Best weekday mornings.',
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
    groupId: 'crew-dtla',
    name: 'Spring Street 8-stair',
    address: '3rd & Spring, Los Angeles',
    latitude: 34.0425,
    longitude: -118.2535,
    createdAt: '2026-06-14T21:00:00.000Z',
    description: 'Clean 8-stair with a long run-up. Watch for lunch-hour foot traffic.',
    createdBy: USER_ID,
    createdByUsername: 'you',
    media: [],
  },
  {
    id: 'spot-schoolyard',
    groupId: 'crew-dtla',
    name: '3rd Street schoolyard',
    address: 'Near 3rd & Hill, Los Angeles',
    latitude: 34.0405,
    longitude: -118.247,
    createdAt: '2026-06-18T16:30:00.000Z',
    description: 'Banks and a manny pad after school lets out. Smooth ground, lights until 10.',
    createdBy: 'user-jules',
    createdByUsername: 'jules',
    media: [],
  },
];

function pin(spot: SpotDetail): SpotPin {
  return {
    id: spot.id,
    groupId: spot.groupId,
    name: spot.name,
    address: spot.address,
    latitude: spot.latitude,
    longitude: spot.longitude,
    createdAt: spot.createdAt,
  };
}

export const previewUserId = USER_ID;

export const previewApi = {
  getGroups: async () => ({ groups: [...groups] }),

  createGroup: async (name: string) => {
    const group: Group = {
      id: `crew-${Date.now()}`,
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
        username: 'you',
        role: 'owner',
        joinedAt: group.createdAt,
      },
    ];
    return { group };
  },

  joinGroup: async (inviteCode: string) => {
    const group = groups.find((g) => g.inviteCode.toLowerCase() === inviteCode.toLowerCase());
    if (!group) {
      throw new Error('No crew with that invite code');
    }
    return { group: { id: group.id, name: group.name, inviteCode: group.inviteCode } };
  },

  getGroupMembers: async (groupId: string) => ({
    members: membersByGroup[groupId] ?? [],
  }),

  leaveGroup: async (groupId: string) => {
    const index = groups.findIndex((g) => g.id === groupId);
    if (index >= 0) groups.splice(index, 1);
  },

  getSpots: async (groupId?: string) => ({
    spots: spots.filter((s) => (groupId ? s.groupId === groupId : true)).map(pin),
  }),

  getSpot: async (spotId: string) => {
    const spot = spots.find((s) => s.id === spotId);
    if (!spot) throw new Error('Spot not found');
    return { spot };
  },

  createSpot: async (input: {
    groupId: string;
    name: string;
    description: string;
    address: string;
    latitude: number;
    longitude: number;
  }) => {
    const spot: SpotDetail = {
      id: `spot-${Date.now()}`,
      groupId: input.groupId,
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
    return { spot: { id: spot.id } };
  },

  registerSpotMedia: async (): Promise<PendingUpload> => {
    throw new Error('Media uploads are disabled in this web preview');
  },

  deleteSpot: async (spotId: string) => {
    const index = spots.findIndex((s) => s.id === spotId);
    if (index >= 0) spots.splice(index, 1);
  },
};
