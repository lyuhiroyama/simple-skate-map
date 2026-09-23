import { supabaseAdmin } from '../supabase.js';
import { tombstoneUsername } from './profile.js';

/**
 * Remove the login. Keep the profile, messages, and spots.
 * Other people still see that history as Deleted Account.
 */
export async function deleteUserAccount(userId: string) {
  const { data: ownedGroups, error: groupsError } = await supabaseAdmin
    .from('groups')
    .select('id')
    .eq('created_by', userId);
  if (groupsError) throw groupsError;

  for (const group of ownedGroups ?? []) {
    const { data: others, error: othersError } = await supabaseAdmin
      .from('group_members')
      .select('user_id')
      .eq('group_id', group.id)
      .neq('user_id', userId)
      .order('joined_at', { ascending: true })
      .limit(1);
    if (othersError) throw othersError;
    const nextOwner = others?.[0]?.user_id;
    if (!nextOwner) continue;
    const { error: transferError } = await supabaseAdmin
      .from('groups')
      .update({ created_by: nextOwner })
      .eq('id', group.id);
    if (transferError) throw transferError;
    const { error: roleError } = await supabaseAdmin
      .from('group_members')
      .update({ role: 'owner' })
      .eq('group_id', group.id)
      .eq('user_id', nextOwner);
    if (roleError) throw roleError;
  }

  const { data: memberships, error: membershipError } = await supabaseAdmin
    .from('group_members')
    .select('group_id')
    .eq('user_id', userId);
  if (membershipError) throw membershipError;

  const { error: leaveError } = await supabaseAdmin.from('group_members').delete().eq('user_id', userId);
  if (leaveError) throw leaveError;

  const { error: blocksError } = await supabaseAdmin.from('user_blocks').delete().eq('blocker_id', userId);
  if (blocksError) throw blocksError;

  const { error: hiddenError } = await supabaseAdmin.from('hidden_content').delete().eq('user_id', userId);
  if (hiddenError) throw hiddenError;

  for (const row of memberships ?? []) {
    const { count, error: countError } = await supabaseAdmin
      .from('group_members')
      .select('*', { count: 'exact', head: true })
      .eq('group_id', row.group_id);
    if (countError) throw countError;
    if ((count ?? 0) > 0) continue;
    const { error: deleteGroupError } = await supabaseAdmin.from('groups').delete().eq('id', row.group_id);
    if (deleteGroupError) throw deleteGroupError;
  }

  const { error: tombstoneError } = await supabaseAdmin
    .from('profiles')
    .update({
      username: tombstoneUsername(userId),
      deleted_at: new Date().toISOString(),
    })
    .eq('id', userId);
  if (tombstoneError) throw tombstoneError;

  const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (deleteError) throw deleteError;
}
