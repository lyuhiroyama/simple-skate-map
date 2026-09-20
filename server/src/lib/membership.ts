import { supabaseAdmin } from '../supabase.js';

export async function isGroupMember(userId: string, groupId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('group_members')
    .select('group_id')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

export async function memberGroupIds(userId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from('group_members')
    .select('group_id')
    .eq('user_id', userId);
  if (error) throw error;
  return (data ?? []).map((row) => row.group_id as string);
}

export async function canAccessSpot(userId: string, spotId: string): Promise<boolean> {
  const { data: spot, error } = await supabaseAdmin
    .from('spots')
    .select('id, created_by, spot_shares(group_id)')
    .eq('id', spotId)
    .maybeSingle();
  if (error) throw error;
  if (!spot) return false;
  if (spot.created_by === userId) return true;
  const shareIds = ((spot.spot_shares ?? []) as { group_id: string }[]).map((s) => s.group_id);
  if (shareIds.length === 0) return false;
  const mine = await memberGroupIds(userId);
  return shareIds.some((id) => mine.includes(id));
}
