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
