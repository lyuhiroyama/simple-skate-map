import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { MEDIA_BUCKET, supabaseAdmin } from '../supabase.js';
import { canAccessSpot, isGroupMember, memberGroupIds } from '../lib/membership.js';
import { blockedUserIds, hiddenContentIds } from '../lib/moderation.js';
import { signPaths } from '../lib/signedUrls.js';
import { assertCleanText } from '../lib/wordFilter.js';

export const spotsRouter = Router();

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

type ShareRow = { group_id: string };

function groupIdsFrom(shares: ShareRow[] | null | undefined): string[] {
  return (shares ?? []).map((s) => s.group_id);
}

function mapPin(s: {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  created_at: string;
  created_by?: string;
  spot_shares?: ShareRow[] | null;
}) {
  return {
    id: s.id,
    groupIds: groupIdsFrom(s.spot_shares),
    name: s.name,
    address: s.address,
    latitude: s.latitude,
    longitude: s.longitude,
    createdAt: s.created_at,
  };
}

/**
 * List spots I created, plus spots shared with my groups.
 * ?groupId= limits to pins shared with that group.
 */
spotsRouter.get('/', async (req, res) => {
  const groupId = typeof req.query.groupId === 'string' ? req.query.groupId : undefined;
  const [myGroups, blockedList, hiddenList] = await Promise.all([
    memberGroupIds(req.userId),
    blockedUserIds(req.userId),
    hiddenContentIds(req.userId, 'spot'),
  ]);
  const blocked = new Set(blockedList);
  const hidden = new Set(hiddenList);
  const keep = (id: string, createdBy: string | undefined) =>
    !hidden.has(id) && (!createdBy || createdBy === req.userId || !blocked.has(createdBy));

  if (groupId) {
    if (!myGroups.includes(groupId)) {
      res.status(403).json({ error: 'You are not a member of this group' });
      return;
    }
    const { data, error } = await supabaseAdmin
      .from('spot_shares')
      .select(
        'spots!inner(id, name, address, latitude, longitude, created_at, created_by, spot_shares(group_id))',
      )
      .eq('group_id', groupId);
    if (error) throw error;
    const spots = (data ?? [])
      .map((row) => row.spots as unknown as Parameters<typeof mapPin>[0] | Parameters<typeof mapPin>[0][])
      .flatMap((spot) => (Array.isArray(spot) ? spot : spot ? [spot] : []))
      .filter((spot) => keep(spot.id, spot.created_by))
      .map(mapPin);
    res.json({ spots });
    return;
  }

  const [{ data: owned, error: ownedError }, sharedResult] = await Promise.all([
    supabaseAdmin
      .from('spots')
      .select('id, name, address, latitude, longitude, created_at, created_by, spot_shares(group_id)')
      .eq('created_by', req.userId)
      .order('created_at', { ascending: false }),
    myGroups.length > 0
      ? supabaseAdmin
          .from('spot_shares')
          .select(
            'spots!inner(id, name, address, latitude, longitude, created_at, created_by, spot_shares(group_id))',
          )
          .in('group_id', myGroups)
      : Promise.resolve({ data: [] as { spots: unknown }[], error: null }),
  ]);
  if (ownedError) throw ownedError;
  if (sharedResult.error) throw sharedResult.error;

  const byId = new Map(
    (owned ?? []).filter((s) => keep(s.id, s.created_by)).map((s) => [s.id, mapPin(s)]),
  );

  for (const row of sharedResult.data ?? []) {
    const raw = row.spots as unknown as Parameters<typeof mapPin>[0] | Parameters<typeof mapPin>[0][] | null;
    const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
    for (const spot of list) {
      if (!keep(spot.id, spot.created_by)) continue;
      if (!byId.has(spot.id)) byId.set(spot.id, mapPin(spot));
    }
  }

  res.json({ spots: [...byId.values()] });
});

const createSpotSchema = z.object({
  groupIds: z.array(z.string().uuid()).optional().default([]),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(2000).default(''),
  address: z.string().trim().max(300).default(''),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

/** Create a personal pin; optionally share it with groups I belong to. */
spotsRouter.post('/', async (req, res) => {
  const parsed = createSpotSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid spot payload', details: parsed.error.flatten() });
    return;
  }

  const { groupIds, name, description, address, latitude, longitude } = parsed.data;
  assertCleanText(name, 'Name');
  if (description) assertCleanText(description, 'Notes');
  for (const groupId of groupIds) {
    if (!(await isGroupMember(req.userId, groupId))) {
      res.status(403).json({ error: 'You are not a member of one of those groups' });
      return;
    }
  }

  const { data: spot, error } = await supabaseAdmin
    .from('spots')
    .insert({
      created_by: req.userId,
      name,
      description,
      address,
      latitude,
      longitude,
    })
    .select()
    .single();
  if (error) throw error;

  if (groupIds.length > 0) {
    const { error: shareError } = await supabaseAdmin.from('spot_shares').insert(
      groupIds.map((groupId) => ({ spot_id: spot.id, group_id: groupId })),
    );
    if (shareError) throw shareError;
  }

  res.status(201).json({ spot: { id: spot.id, groupIds, name: spot.name } });
});

/** Full spot detail: description, creator, and signed media URLs. */
spotsRouter.get('/:spotId', async (req, res) => {
  const [{ data: spot, error }, myGroups, blocked, hidden] = await Promise.all([
    supabaseAdmin
      .from('spots')
      .select(
        'id, created_by, name, description, address, latitude, longitude, created_at, profiles(username), spot_media(id, storage_path, media_type, created_at), spot_shares(group_id)',
      )
      .eq('id', req.params.spotId)
      .maybeSingle(),
    memberGroupIds(req.userId),
    blockedUserIds(req.userId),
    hiddenContentIds(req.userId, 'spot'),
  ]);
  if (error) throw error;
  const shareIds = groupIdsFrom(spot?.spot_shares);
  const canAccess =
    !!spot && (spot.created_by === req.userId || shareIds.some((id) => myGroups.includes(id)));
  if (!spot || !canAccess) {
    res.status(404).json({ error: 'Spot not found' });
    return;
  }

  if (hidden.includes(spot.id) || (spot.created_by !== req.userId && blocked.includes(spot.created_by))) {
    res.status(404).json({ error: 'Spot not found' });
    return;
  }

  const mediaRows = [...(spot.spot_media ?? [])].sort((a, b) =>
    String(a.created_at).localeCompare(String(b.created_at)),
  );
  const signed = await signPaths(
    MEDIA_BUCKET,
    mediaRows.map((m) => m.storage_path),
    SIGNED_URL_TTL_SECONDS,
  );
  const media = mediaRows.flatMap((m) => {
    const url = signed.get(m.storage_path);
    if (!url) return [];
    return [
      {
        id: m.id,
        mediaType: m.media_type,
        url,
        createdAt: m.created_at,
      },
    ];
  });

  res.json({
    spot: {
      id: spot.id,
      groupIds: groupIdsFrom(spot.spot_shares),
      createdBy: spot.created_by,
      createdByUsername:
        (spot.profiles as unknown as { username: string } | null)?.username ?? 'unknown',
      name: spot.name,
      description: spot.description,
      address: spot.address,
      latitude: spot.latitude,
      longitude: spot.longitude,
      createdAt: spot.created_at,
      media,
    },
  });
});

const sendSpotSchema = z.object({
  groupIds: z.array(z.string().min(1)).min(1).max(50),
  body: z.string().trim().max(2000).optional(),
});

/** Send this pin into one or more group chats. Creator also shares it with those groups. */
spotsRouter.post('/:spotId/send', async (req, res) => {
  const parsed = sendSpotSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Pick at least one group' });
    return;
  }

  const body = parsed.data.body ?? '';
  if (body) assertCleanText(body, 'Message');

  const { data: spot, error } = await supabaseAdmin
    .from('spots')
    .select(
      'id, created_by, name, address, latitude, longitude, spot_shares(group_id), spot_media(storage_path, media_type, created_at)',
    )
    .eq('id', req.params.spotId)
    .maybeSingle();
  if (error) throw error;
  if (!spot || !(await canAccessSpot(req.userId, spot.id))) {
    res.status(404).json({ error: 'Spot not found' });
    return;
  }

  const groupIds = [...new Set(parsed.data.groupIds)];
  for (const groupId of groupIds) {
    if (!(await isGroupMember(req.userId, groupId))) {
      res.status(403).json({ error: 'You are not a member of one of those groups' });
      return;
    }
  }

  const firstMedia = [...(spot.spot_media ?? [])].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  )[0];
  const snapshot = {
    id: spot.id,
    name: spot.name,
    address: spot.address ?? '',
    latitude: spot.latitude,
    longitude: spot.longitude,
    ...(firstMedia
      ? {
          media: {
            storagePath: firstMedia.storage_path,
            mediaType: firstMedia.media_type === 'video' ? 'video' : 'photo',
          },
        }
      : {}),
  };

  if (spot.created_by === req.userId) {
    const existing = new Set(groupIdsFrom(spot.spot_shares));
    const missing = groupIds.filter((id) => !existing.has(id));
    if (missing.length > 0) {
      const { error: shareError } = await supabaseAdmin.from('spot_shares').insert(
        missing.map((groupId) => ({ spot_id: spot.id, group_id: groupId })),
      );
      if (shareError) throw shareError;
    }
  }

  for (const groupId of groupIds) {
    const { error: messageError } = await supabaseAdmin.from('messages').insert({
      group_id: groupId,
      user_id: req.userId,
      body,
      spot: snapshot,
    });
    if (messageError) throw messageError;
  }

  const nextShares =
    spot.created_by === req.userId
      ? [...new Set([...groupIdsFrom(spot.spot_shares), ...groupIds])]
      : groupIdsFrom(spot.spot_shares);
  res.json({ ok: true, groupIds: nextShares });
});

const shareSpotSchema = z.object({
  groupIds: z.array(z.string().uuid()).max(50),
});

/** Replace which groups this pin is shared with. Creator only. */
spotsRouter.patch('/:spotId', async (req, res) => {
  const parsed = shareSpotSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid share payload' });
    return;
  }

  const { data: spot, error } = await supabaseAdmin
    .from('spots')
    .select('id, created_by')
    .eq('id', req.params.spotId)
    .maybeSingle();
  if (error) throw error;
  if (!spot) {
    res.status(404).json({ error: 'Spot not found' });
    return;
  }
  if (spot.created_by !== req.userId) {
    res.status(403).json({ error: 'Only the spot creator can share it' });
    return;
  }

  const groupIds = [...new Set(parsed.data.groupIds)];
  for (const groupId of groupIds) {
    if (!(await isGroupMember(req.userId, groupId))) {
      res.status(403).json({ error: 'You are not a member of one of those groups' });
      return;
    }
  }

  const { error: clearError } = await supabaseAdmin.from('spot_shares').delete().eq('spot_id', spot.id);
  if (clearError) throw clearError;

  if (groupIds.length > 0) {
    const { error: shareError } = await supabaseAdmin.from('spot_shares').insert(
      groupIds.map((groupId) => ({ spot_id: spot.id, group_id: groupId })),
    );
    if (shareError) throw shareError;
  }

  res.json({ spot: { id: spot.id, groupIds } });
});

const addMediaSchema = z.object({
  mediaType: z.enum(['photo', 'video']),
  fileExtension: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9]{1,8}$/),
});

/**
 * Register a media item for a spot and return a signed upload URL.
 * The client then PUTs the file bytes directly to Supabase Storage.
 */
spotsRouter.post('/:spotId/media', async (req, res) => {
  const parsed = addMediaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'mediaType (photo|video) and fileExtension are required' });
    return;
  }

  const { data: spot, error } = await supabaseAdmin
    .from('spots')
    .select('id')
    .eq('id', req.params.spotId)
    .maybeSingle();
  if (error) throw error;
  if (!spot || !(await canAccessSpot(req.userId, spot.id))) {
    res.status(404).json({ error: 'Spot not found' });
    return;
  }

  const mediaId = randomUUID();
  const storagePath = `${spot.id}/${mediaId}.${parsed.data.fileExtension.toLowerCase()}`;

  const { data: upload, error: uploadError } = await supabaseAdmin.storage
    .from(MEDIA_BUCKET)
    .createSignedUploadUrl(storagePath);
  if (uploadError) throw uploadError;

  const { error: insertError } = await supabaseAdmin.from('spot_media').insert({
    id: mediaId,
    spot_id: spot.id,
    uploaded_by: req.userId,
    storage_path: storagePath,
    media_type: parsed.data.mediaType,
  });
  if (insertError) throw insertError;

  res.status(201).json({
    media: {
      id: mediaId,
      storagePath,
      uploadUrl: upload.signedUrl,
      uploadToken: upload.token,
    },
  });
});

/** Delete a spot I created (media rows + storage objects cascade/cleanup). */
spotsRouter.delete('/:spotId', async (req, res) => {
  const { data: spot, error } = await supabaseAdmin
    .from('spots')
    .select('id, created_by, spot_media(storage_path)')
    .eq('id', req.params.spotId)
    .maybeSingle();
  if (error) throw error;
  if (!spot) {
    res.status(404).json({ error: 'Spot not found' });
    return;
  }
  if (spot.created_by !== req.userId) {
    res.status(403).json({ error: 'Only the spot creator can delete it' });
    return;
  }

  const paths = (spot.spot_media ?? []).map((m) => m.storage_path);
  if (paths.length > 0) {
    await supabaseAdmin.storage.from(MEDIA_BUCKET).remove(paths);
  }

  const { error: deleteError } = await supabaseAdmin.from('spots').delete().eq('id', spot.id);
  if (deleteError) throw deleteError;

  res.status(204).end();
});
