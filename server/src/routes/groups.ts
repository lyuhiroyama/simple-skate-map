import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../supabase.js';
import { memberGroupIds } from '../lib/membership.js';

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
