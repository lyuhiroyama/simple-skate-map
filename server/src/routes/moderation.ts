import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../lib/httpError.js';
import { canAccessSpot, isGroupMember } from '../lib/membership.js';
import { hideContent } from '../lib/moderation.js';
import { publicUsername } from '../lib/profile.js';
import { supabaseAdmin } from '../supabase.js';

export const moderationRouter = Router();

const reportSchema = z.object({
  contentType: z.enum(['message', 'spot', 'user']),
  contentId: z.string().uuid().optional(),
  targetUserId: z.string().uuid().optional(),
  reason: z.enum(['inappropriate', 'harassment', 'spam', 'other']).default('other'),
});

moderationRouter.post('/reports', async (req, res) => {
  const parsed = reportSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid report' });
    return;
  }

  let targetUserId = parsed.data.targetUserId ?? '';
  const contentId = parsed.data.contentId ?? null;
  const { contentType, reason } = parsed.data;

  if (contentType === 'message') {
    if (!contentId) {
      res.status(400).json({ error: 'Message id is required' });
      return;
    }
    const { data: message, error } = await supabaseAdmin
      .from('messages')
      .select('id, user_id, group_id')
      .eq('id', contentId)
      .maybeSingle();
    if (error) throw error;
    if (!message || !(await isGroupMember(req.userId, message.group_id))) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }
    if (message.user_id === req.userId) {
      res.status(400).json({ error: 'You cannot report your own message' });
      return;
    }
    targetUserId = message.user_id;
    await hideContent(req.userId, 'message', message.id);
  } else if (contentType === 'spot') {
    if (!contentId) {
      res.status(400).json({ error: 'Spot id is required' });
      return;
    }
    const { data: spot, error } = await supabaseAdmin
      .from('spots')
      .select('id, created_by')
      .eq('id', contentId)
      .maybeSingle();
    if (error) throw error;
    if (!spot || !(await canAccessSpot(req.userId, spot.id))) {
      res.status(404).json({ error: 'Spot not found' });
      return;
    }
    if (spot.created_by === req.userId) {
      res.status(400).json({ error: 'You cannot report your own spot' });
      return;
    }
    targetUserId = spot.created_by;
    await hideContent(req.userId, 'spot', spot.id);
  } else {
    if (!targetUserId) {
      res.status(400).json({ error: 'User id is required' });
      return;
    }
    if (targetUserId === req.userId) {
      res.status(400).json({ error: 'You cannot report yourself' });
      return;
    }
    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('id', targetUserId)
      .maybeSingle();
    if (error) throw error;
    if (!profile) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
  }

  const { error: insertError } = await supabaseAdmin.from('reports').insert({
    reporter_id: req.userId,
    target_user_id: targetUserId,
    content_type: contentType,
    content_id: contentId,
    reason,
  });
  if (insertError) throw insertError;

  res.status(201).json({ ok: true });
});

moderationRouter.get('/blocks', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('user_blocks')
    .select('blocked_id, created_at')
    .eq('blocker_id', req.userId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const ids = (data ?? []).map((row) => row.blocked_id as string);
  const usernames = new Map<string, string>();
  if (ids.length > 0) {
    const { data: profiles, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, username')
      .in('id', ids);
    if (profileError) throw profileError;
    for (const profile of profiles ?? []) {
      usernames.set(profile.id, publicUsername(profile));
    }
  }

  const blocks = (data ?? []).map((row) => ({
    userId: row.blocked_id,
    username: usernames.get(row.blocked_id) ?? 'Deleted Account',
    createdAt: row.created_at,
  }));
  res.json({ blocks });
});

const blockSchema = z.object({
  userId: z.string().uuid(),
});

moderationRouter.post('/blocks', async (req, res) => {
  const parsed = blockSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'User id is required' });
    return;
  }
  if (parsed.data.userId === req.userId) {
    throw new HttpError('You cannot block yourself', 400);
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, username')
    .eq('id', parsed.data.userId)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const { error } = await supabaseAdmin.from('user_blocks').upsert(
    { blocker_id: req.userId, blocked_id: parsed.data.userId },
    { onConflict: 'blocker_id,blocked_id' },
  );
  if (error) throw error;

  res.status(201).json({
    block: { userId: profile.id, username: profile.username },
  });
});

moderationRouter.delete('/blocks/:userId', async (req, res) => {
  const { error } = await supabaseAdmin
    .from('user_blocks')
    .delete()
    .eq('blocker_id', req.userId)
    .eq('blocked_id', req.params.userId);
  if (error) throw error;
  res.status(204).end();
});
