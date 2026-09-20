export interface Group {
  id: string;
  name: string;
  inviteCode: string;
  createdBy: string;
  createdAt: string;
  memberCount: number;
  myRole: 'owner' | 'member';
}

export interface GroupMember {
  userId: string;
  username: string;
  role: 'owner' | 'member';
  joinedAt: string;
}

export interface SpotPin {
  id: string;
  groupIds: string[];
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  createdAt: string;
}

export interface SpotMedia {
  id: string;
  mediaType: 'photo' | 'video';
  url: string;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  groupId: string;
  userId: string;
  username: string;
  body: string;
  createdAt: string;
  imageUrl?: string;
  status?: 'sending' | 'sent' | 'failed';
}

export interface SpotDetail extends SpotPin {
  description: string;
  createdBy: string;
  createdByUsername: string;
  media: SpotMedia[];
}

export interface Profile {
  id: string;
  username: string;
  createdAt: string;
}

export interface PendingUpload {
  media: { id: string; storagePath: string; uploadUrl: string; uploadToken: string };
}
