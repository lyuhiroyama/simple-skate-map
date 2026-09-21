import { CHAT_MEDIA_BUCKET, MEDIA_BUCKET, supabaseAdmin } from '../supabase.js';

/**
 * Wipe the signed-in user: transfer groups they own if anyone else is left,
 * remove their media from storage, then delete the auth user (cascades profile).
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

  const { data: chatRows, error: chatError } = await supabaseAdmin
    .from('messages')
    .select('storage_path')
    .eq('user_id', userId)
    .not('storage_path', 'is', null);
  if (chatError) throw chatError;
  const chatPaths = (chatRows ?? [])
    .map((row) => row.storage_path)
    .filter((path): path is string => Boolean(path));
  if (chatPaths.length > 0) {
    await supabaseAdmin.storage.from(CHAT_MEDIA_BUCKET).remove(chatPaths);
  }

  const { data: ownedSpots, error: spotsError } = await supabaseAdmin
    .from('spots')
    .select('id, spot_media(storage_path)')
    .eq('created_by', userId);
  if (spotsError) throw spotsError;

  const { data: uploads, error: uploadsError } = await supabaseAdmin
    .from('spot_media')
    .select('storage_path')
    .eq('uploaded_by', userId);
  if (uploadsError) throw uploadsError;

  const spotPaths = [
    ...(ownedSpots ?? []).flatMap((spot) =>
      (spot.spot_media ?? []).map((media) => media.storage_path),
    ),
    ...(uploads ?? []).map((media) => media.storage_path),
  ].filter((path): path is string => Boolean(path));
  const uniqueSpotPaths = [...new Set(spotPaths)];
  if (uniqueSpotPaths.length > 0) {
    await supabaseAdmin.storage.from(MEDIA_BUCKET).remove(uniqueSpotPaths);
  }

  const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (deleteError) throw deleteError;
}
