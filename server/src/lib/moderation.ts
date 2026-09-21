import { supabaseAdmin } from '../supabase.js';

export async function blockedUserIds(userId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from('user_blocks')
    .select('blocked_id')
    .eq('blocker_id', userId);
  if (error) throw error;
  return (data ?? []).map((row) => row.blocked_id as string);
}

export async function hiddenContentIds(userId: string, contentType: 'message' | 'spot'): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from('hidden_content')
    .select('content_id')
    .eq('user_id', userId)
    .eq('content_type', contentType);
  if (error) throw error;
  return (data ?? []).map((row) => row.content_id as string);
}

export async function hideContent(
  userId: string,
  contentType: 'message' | 'spot',
  contentId: string,
) {
  const { error } = await supabaseAdmin.from('hidden_content').upsert(
    { user_id: userId, content_type: contentType, content_id: contentId },
    { onConflict: 'user_id,content_type,content_id' },
  );
  if (error) throw error;
}
