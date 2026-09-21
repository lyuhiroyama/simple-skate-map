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

export interface ChatMedia {
  url: string;
  mediaType: 'photo' | 'video';
}

export interface ChatSpot {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
}

export interface ChatMessage {
  id: string;
  groupId: string;
  userId: string;
  username: string;
  body: string;
  createdAt: string;
  media?: ChatMedia[];
  imageUrl?: string;
  spot?: ChatSpot;
  status?: 'sending' | 'sent' | 'failed';
}

export function chatMediaOf(message: ChatMessage): ChatMedia[] {
  if (message.media && message.media.length > 0) return message.media;
  if (message.imageUrl) return [{ url: message.imageUrl, mediaType: 'photo' }];
  return [];
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

export interface BlockedUser {
  userId: string;
  username: string;
  createdAt: string;
}

export interface PendingUpload {
  media: { id: string; storagePath: string; uploadUrl: string; uploadToken: string };
}
