import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { CHAT_MEDIA_BUCKET, MEDIA_BUCKET, supabaseAdmin } from '../supabase.js';
import { groupRole, isGroupMember, memberGroupIds } from '../lib/membership.js';
import { blockedUserIds, hiddenContentIds } from '../lib/moderation.js';
import { assertCleanText } from '../lib/wordFilter.js';

export const groupsRouter = Router();

/** List groups the current user belongs to, with member counts. */
groupsRouter.get('/', async (req, res) => {
  const groupIds = await memberGroupIds(req.userId);
  if (groupIds.length === 0) {
    res.json({ groups: [] });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from('groups')
    .select('id, name, invite_code, created_by, created_at, group_members(user_id, role)')
    .in('id', groupIds)
    .order('created_at', { ascending: true });
  if (error) throw error;

  const groups = (data ?? []).map((g) => ({
    id: g.id,
    name: g.name,
    inviteCode: g.invite_code,
    createdBy: g.created_by,
    createdAt: g.created_at,
    memberCount: g.group_members.length,
    myRole: g.group_members.find((m) => m.user_id === req.userId)?.role ?? 'member',
  }));

  res.json({ groups });
});

const createGroupSchema = z.object({
  name: z.string().trim().min(1).max(64),
});

/** Create a group; creator becomes the owner. */
groupsRouter.post('/', async (req, res) => {
  const parsed = createGroupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'A group name (1-64 chars) is required' });
    return;
  }

  const { data: group, error } = await supabaseAdmin
    .from('groups')
    .insert({ name: parsed.data.name, created_by: req.userId })
    .select()
    .single();
  if (error) throw error;

  const { error: memberError } = await supabaseAdmin
    .from('group_members')
    .insert({ group_id: group.id, user_id: req.userId, role: 'owner' });
  if (memberError) throw memberError;

  res.status(201).json({
    group: {
      id: group.id,
      name: group.name,
      inviteCode: group.invite_code,
      createdBy: group.created_by,
      createdAt: group.created_at,
      memberCount: 1,
      myRole: 'owner',
    },
  });
});

const joinGroupSchema = z.object({
  inviteCode: z.string().trim().min(1),
});

/** Join a group using its invite code. */
groupsRouter.post('/join', async (req, res) => {
  const parsed = joinGroupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'An invite code is required' });
    return;
  }

  const { data: group, error } = await supabaseAdmin
    .from('groups')
    .select('id, name, invite_code, created_by, created_at')
    .eq('invite_code', parsed.data.inviteCode.toLowerCase())
    .maybeSingle();
  if (error) throw error;
  if (!group) {
    res.status(404).json({ error: 'No group found for that invite code' });
    return;
  }

  const { error: memberError } = await supabaseAdmin
    .from('group_members')
    .upsert(
      { group_id: group.id, user_id: req.userId, role: 'member' },
      { onConflict: 'group_id,user_id', ignoreDuplicates: true },
    );
  if (memberError) throw memberError;

  res.json({
    group: {
      id: group.id,
      name: group.name,
      inviteCode: group.invite_code,
      createdBy: group.created_by,
      createdAt: group.created_at,
    },
  });
});

/** List members of one of my groups. */
groupsRouter.get('/:groupId/members', async (req, res) => {
  const groupIds = await memberGroupIds(req.userId);
  if (!groupIds.includes(req.params.groupId)) {
    res.status(403).json({ error: 'You are not a member of this group' });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from('group_members')
    .select('user_id, role, joined_at, profiles(username)')
    .eq('group_id', req.params.groupId)
    .order('joined_at', { ascending: true });
  if (error) throw error;

  const members = (data ?? []).map((m) => ({
    userId: m.user_id,
    role: m.role,
    joinedAt: m.joined_at,
    username: (m.profiles as unknown as { username: string } | null)?.username ?? 'unknown',
  }));

  res.json({ members });
});

const SIGNED_URL_TTL_SECONDS = 60 * 60;

type SpotSnapshot = {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  mediaStoragePath?: string;
  mediaType?: 'photo' | 'video';
};

type SignedMedia = { url: string; mediaType: 'photo' | 'video' };

function parseSpot(value: unknown): SpotSnapshot | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const o = value as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.name !== 'string') return undefined;
  const media = o.media && typeof o.media === 'object' ? (o.media as Record<string, unknown>) : null;
  const storagePath = media && typeof media.storagePath === 'string' ? media.storagePath : undefined;
  return {
    id: o.id,
    name: o.name,
    address: typeof o.address === 'string' ? o.address : '',
    latitude: typeof o.latitude === 'number' ? o.latitude : 0,
    longitude: typeof o.longitude === 'number' ? o.longitude : 0,
    mediaStoragePath: storagePath,
    mediaType: storagePath ? (media?.mediaType === 'video' ? 'video' : 'photo') : undefined,
  };
}

async function signSpotMedia(storagePath: string): Promise<string | undefined> {
  const { data, error } = await supabaseAdmin.storage
    .from(MEDIA_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) return undefined;
  return data.signedUrl;
}

async function firstSpotMediaById(spotIds: string[]) {
  const unique = [...new Set(spotIds)];
  const map = new Map<string, { storagePath: string; mediaType: 'photo' | 'video' }>();
  if (unique.length === 0) return map;
  const { data, error } = await supabaseAdmin
    .from('spot_media')
    .select('spot_id, storage_path, media_type, created_at')
    .in('spot_id', unique)
    .order('created_at', { ascending: true });
  if (error) throw error;
  for (const row of data ?? []) {
    if (map.has(row.spot_id)) continue;
    map.set(row.spot_id, {
      storagePath: row.storage_path,
      mediaType: row.media_type === 'video' ? 'video' : 'photo',
    });
  }
  return map;
}

function summarizeReactions(
  rows: { message_id: string; user_id: string; emoji: string }[],
  messageId: string,
  myId: string,
) {
  const byEmoji = new Map<string, { count: number; me: boolean }>();
  for (const row of rows) {
    if (row.message_id !== messageId) continue;
    const cur = byEmoji.get(row.emoji) ?? { count: 0, me: false };
    cur.count += 1;
    if (row.user_id === myId) cur.me = true;
    byEmoji.set(row.emoji, cur);
  }
  return [...byEmoji.entries()].map(([emoji, value]) => ({ emoji, ...value }));
}

function mapMessage(
  row: {
    id: string;
    group_id: string;
    user_id: string;
    body: string;
    created_at: string;
    spot?: unknown;
  },
  username: string,
  media: SignedMedia[] = [],
  spotMedia?: SignedMedia,
  reactions: { emoji: string; count: number; me: boolean }[] = [],
) {
  const spot = parseSpot(row.spot);
  return {
    id: row.id,
    groupId: row.group_id,
    userId: row.user_id,
    username,
    body: row.body,
    createdAt: row.created_at,
    media,
    imageUrl: media[0]?.url,
    reactions,
    spot: spot
      ? {
          id: spot.id,
          name: spot.name,
          address: spot.address,
          latitude: spot.latitude,
          longitude: spot.longitude,
          media: spotMedia,
        }
      : undefined,
  };
}

type MediaRow = { storagePath: string; mediaType: 'photo' | 'video' };

function mediaFromRow(row: { storage_path?: string | null; media?: unknown }): MediaRow[] {
  const raw = Array.isArray(row.media) ? row.media : [];
  const fromJson = raw.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const path = (item as { storagePath?: unknown }).storagePath;
    const mediaType = (item as { mediaType?: unknown }).mediaType;
    if (typeof path !== 'string') return [];
    return [
      {
        storagePath: path,
        mediaType: mediaType === 'video' ? ('video' as const) : ('photo' as const),
      },
    ];
  });
  if (fromJson.length > 0) return fromJson;
  if (row.storage_path) return [{ storagePath: row.storage_path, mediaType: 'photo' }];
  return [];
}

/** List chat messages in one of my groups. */
groupsRouter.get('/:groupId/messages', async (req, res) => {
  if (!(await isGroupMember(req.userId, req.params.groupId))) {
    res.status(403).json({ error: 'You are not a member of this group' });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from('messages')
    .select('id, group_id, user_id, body, storage_path, media, spot, created_at, profiles(username)')
    .eq('group_id', req.params.groupId)
    .order('created_at', { ascending: true });
  if (error) throw error;

  const blocked = new Set(await blockedUserIds(req.userId));
  const hidden = new Set(await hiddenContentIds(req.userId, 'message'));
  const visible = (data ?? []).filter(
    (row) => !blocked.has(row.user_id) && !hidden.has(row.id),
  );

  const spotsNeedingMedia = visible.flatMap((row) => {
    const spot = parseSpot(row.spot);
    return spot && !spot.mediaStoragePath ? [spot.id] : [];
  });
  const fallbackSpotMedia = await firstSpotMediaById(spotsNeedingMedia);

  let reactionRows: { message_id: string; user_id: string; emoji: string }[] = [];
  if (visible.length > 0) {
    const { data: reactionData, error: reactionError } = await supabaseAdmin
      .from('message_reactions')
      .select('message_id, user_id, emoji')
      .in(
        'message_id',
        visible.map((row) => row.id),
      );
    if (!reactionError) reactionRows = reactionData ?? [];
  }

  const messages = await Promise.all(
    visible.map(async (row) => {
      const files = mediaFromRow(row);
      const media = await Promise.all(
        files.map(async (file) => {
          const { data: signed, error: signError } = await supabaseAdmin.storage
            .from(CHAT_MEDIA_BUCKET)
            .createSignedUrl(file.storagePath, SIGNED_URL_TTL_SECONDS);
          if (signError) throw signError;
          return { url: signed.signedUrl, mediaType: file.mediaType };
        }),
      );
      const spot = parseSpot(row.spot);
      const preview =
        spot &&
        (spot.mediaStoragePath
          ? { storagePath: spot.mediaStoragePath, mediaType: spot.mediaType ?? 'photo' }
          : fallbackSpotMedia.get(spot.id));
      const spotUrl = preview ? await signSpotMedia(preview.storagePath) : undefined;
      return mapMessage(
        row,
        (row.profiles as unknown as { username: string } | null)?.username ?? 'unknown',
        media,
        spotUrl && preview ? { url: spotUrl, mediaType: preview.mediaType } : undefined,
        summarizeReactions(reactionRows, row.id, req.userId),
      );
    }),
  );

  res.json({ messages });
});

const sendMessageSchema = z.object({
  body: z.string().trim().max(2000).optional(),
  fileExtension: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9]{1,8}$/)
    .optional(),
  attachments: z
    .array(
      z.object({
        fileExtension: z
          .string()
          .trim()
          .regex(/^[a-zA-Z0-9]{1,8}$/),
        mediaType: z.enum(['photo', 'video']).default('photo'),
      }),
    )
    .max(8)
    .optional(),
});

/** Send text and/or a photo/video album. Attachments return signed upload URLs. */
groupsRouter.post('/:groupId/messages', async (req, res) => {
  const parsed = sendMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Message is empty' });
    return;
  }

  const body = parsed.data.body ?? '';
  const attachments =
    parsed.data.attachments && parsed.data.attachments.length > 0
      ? parsed.data.attachments
      : parsed.data.fileExtension
        ? [{ fileExtension: parsed.data.fileExtension, mediaType: 'photo' as const }]
        : [];
  if (!body && attachments.length === 0) {
    res.status(400).json({ error: 'Message is empty' });
    return;
  }
  if (body) assertCleanText(body, 'Message');

  if (!(await isGroupMember(req.userId, req.params.groupId))) {
    res.status(403).json({ error: 'You are not a member of this group' });
    return;
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('username')
    .eq('id', req.userId)
    .single();
  if (profileError) throw profileError;

  const uploads: { uploadUrl: string; uploadToken: string; storagePath: string }[] = [];
  const media: MediaRow[] = [];

  for (const attachment of attachments) {
    const mediaId = randomUUID();
    const storagePath = `${req.params.groupId}/${mediaId}.${attachment.fileExtension.toLowerCase()}`;
    const { data: upload, error: uploadError } = await supabaseAdmin.storage
      .from(CHAT_MEDIA_BUCKET)
      .createSignedUploadUrl(storagePath);
    if (uploadError) throw uploadError;
    media.push({ storagePath, mediaType: attachment.mediaType });
    uploads.push({
      uploadUrl: upload.signedUrl,
      uploadToken: upload.token,
      storagePath,
    });
  }

  const { data: message, error } = await supabaseAdmin
    .from('messages')
    .insert({
      group_id: req.params.groupId,
      user_id: req.userId,
      body,
      storage_path: media[0]?.storagePath ?? null,
      media,
    })
    .select('id, group_id, user_id, body, created_at')
    .single();
  if (error) throw error;

  res.status(201).json({
    message: mapMessage(message, profile.username, []),
    uploads,
    upload: uploads[0],
  });
});

const REACTION_EMOJIS = ['❤️', '🔥', '😭', '👍', '🙏', '💩'] as const;
const reactSchema = z.object({
  emoji: z.enum(REACTION_EMOJIS),
});

/** Toggle an emoji reaction on a group message. */
groupsRouter.post('/:groupId/messages/:messageId/reactions', async (req, res) => {
  if (!(await isGroupMember(req.userId, req.params.groupId))) {
    res.status(403).json({ error: 'You are not a member of this group' });
    return;
  }
  const parsed = reactSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Pick an emoji' });
    return;
  }

  const { data: message, error: messageError } = await supabaseAdmin
    .from('messages')
    .select('id, group_id')
    .eq('id', req.params.messageId)
    .eq('group_id', req.params.groupId)
    .maybeSingle();
  if (messageError) throw messageError;
  if (!message) {
    res.status(404).json({ error: 'Message not found' });
    return;
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('message_reactions')
    .select('emoji')
    .eq('message_id', message.id)
    .eq('user_id', req.userId)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existing?.emoji === parsed.data.emoji) {
    const { error: deleteError } = await supabaseAdmin
      .from('message_reactions')
      .delete()
      .eq('message_id', message.id)
      .eq('user_id', req.userId);
    if (deleteError) throw deleteError;
  } else {
    const { error: upsertError } = await supabaseAdmin.from('message_reactions').upsert({
      message_id: message.id,
      user_id: req.userId,
      emoji: parsed.data.emoji,
    });
    if (upsertError) throw upsertError;
  }

  const { data: reactionRows, error: listError } = await supabaseAdmin
    .from('message_reactions')
    .select('message_id, user_id, emoji')
    .eq('message_id', message.id);
  if (listError) throw listError;

  res.json({ reactions: summarizeReactions(reactionRows ?? [], message.id, req.userId) });
});

/** Owner removes a member. */
groupsRouter.delete('/:groupId/members/:userId', async (req, res) => {
  const { groupId, userId } = req.params;
  if (userId === req.userId) {
    res.status(400).json({ error: 'Leave the group instead' });
    return;
  }

  const role = await groupRole(req.userId, groupId);
  if (role !== 'owner') {
    res.status(403).json({ error: 'Only the group owner can remove people' });
    return;
  }

  const targetRole = await groupRole(userId, groupId);
  if (!targetRole) {
    res.status(404).json({ error: 'That person is not in this group' });
    return;
  }
  if (targetRole === 'owner') {
    res.status(400).json({ error: 'You cannot remove the owner' });
    return;
  }

  const { error } = await supabaseAdmin
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId);
  if (error) throw error;
  res.status(204).end();
});

/** Leave a group. */
groupsRouter.delete('/:groupId/membership', async (req, res) => {
  const { error } = await supabaseAdmin
    .from('group_members')
    .delete()
    .eq('group_id', req.params.groupId)
    .eq('user_id', req.userId);
  if (error) throw error;
  res.status(204).end();
});
