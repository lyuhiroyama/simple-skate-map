import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { CHAT_MEDIA_BUCKET, supabaseAdmin } from '../supabase.js';
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

function parseSpot(value: unknown) {
  if (!value || typeof value !== 'object') return undefined;
  const o = value as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.name !== 'string') return undefined;
  return {
    id: o.id,
    name: o.name,
    address: typeof o.address === 'string' ? o.address : '',
    latitude: typeof o.latitude === 'number' ? o.latitude : 0,
    longitude: typeof o.longitude === 'number' ? o.longitude : 0,
  };
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
  media: { url: string; mediaType: 'photo' | 'video' }[] = [],
) {
  return {
    id: row.id,
    groupId: row.group_id,
    userId: row.user_id,
    username,
    body: row.body,
    createdAt: row.created_at,
    media,
    imageUrl: media[0]?.url,
    spot: parseSpot(row.spot),
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
      return mapMessage(
        row,
        (row.profiles as unknown as { username: string } | null)?.username ?? 'unknown',
        media,
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
