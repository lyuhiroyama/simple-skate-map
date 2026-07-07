import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { MEDIA_BUCKET, supabaseAdmin } from '../supabase.js';
import { isGroupMember, memberGroupIds } from '../lib/membership.js';

export const spotsRouter = Router();

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

/**
 * List spots across all my groups (or one group via ?groupId=).
 * Lightweight payload for rendering map pins.
 */
spotsRouter.get('/', async (req, res) => {
  const groupIds = await memberGroupIds(req.userId);
  const groupId = typeof req.query.groupId === 'string' ? req.query.groupId : undefined;

  let targetIds = groupIds;
  if (groupId) {
    if (!groupIds.includes(groupId)) {
      res.status(403).json({ error: 'You are not a member of this group' });
      return;
    }
    targetIds = [groupId];
  }

  if (targetIds.length === 0) {
    res.json({ spots: [] });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from('spots')
    .select('id, group_id, name, address, latitude, longitude, created_at')
    .in('group_id', targetIds)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const spots = (data ?? []).map((s) => ({
    id: s.id,
    groupId: s.group_id,
    name: s.name,
    address: s.address,
    latitude: s.latitude,
    longitude: s.longitude,
    createdAt: s.created_at,
  }));

  res.json({ spots });
});

const createSpotSchema = z.object({
  groupId: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(2000).default(''),
  address: z.string().trim().max(300).default(''),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

/** Create a spot in one of my groups. */
spotsRouter.post('/', async (req, res) => {
  const parsed = createSpotSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid spot payload', details: parsed.error.flatten() });
    return;
  }

  const { groupId, name, description, address, latitude, longitude } = parsed.data;
  if (!(await isGroupMember(req.userId, groupId))) {
    res.status(403).json({ error: 'You are not a member of this group' });
    return;
  }

  const { data: spot, error } = await supabaseAdmin
    .from('spots')
    .insert({
      group_id: groupId,
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

  res.status(201).json({ spot: { id: spot.id, groupId: spot.group_id, name: spot.name } });
});

/** Full spot detail: description, creator, and signed media URLs. */
spotsRouter.get('/:spotId', async (req, res) => {
  const { data: spot, error } = await supabaseAdmin
    .from('spots')
    .select(
      'id, group_id, created_by, name, description, address, latitude, longitude, created_at, profiles(username), spot_media(id, storage_path, media_type, created_at)',
    )
    .eq('id', req.params.spotId)
    .maybeSingle();
  if (error) throw error;
  if (!spot || !(await isGroupMember(req.userId, spot.group_id))) {
    res.status(404).json({ error: 'Spot not found' });
    return;
  }

  const mediaRows = spot.spot_media ?? [];
  const media = await Promise.all(
    mediaRows.map(async (m) => {
      const { data: signed, error: signError } = await supabaseAdmin.storage
        .from(MEDIA_BUCKET)
        .createSignedUrl(m.storage_path, SIGNED_URL_TTL_SECONDS);
      if (signError) throw signError;
      return {
        id: m.id,
        mediaType: m.media_type,
        url: signed.signedUrl,
        createdAt: m.created_at,
      };
    }),
  );

  res.json({
    spot: {
      id: spot.id,
      groupId: spot.group_id,
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
    .select('id, group_id')
    .eq('id', req.params.spotId)
    .maybeSingle();
  if (error) throw error;
  if (!spot || !(await isGroupMember(req.userId, spot.group_id))) {
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
