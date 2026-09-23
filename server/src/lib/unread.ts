import { blockedUserIds, hiddenContentIds } from './moderation.js';
import { memberGroupIds } from './membership.js';
import { supabaseAdmin } from '../supabase.js';

/** Group ids where someone else posted after this user last opened the chat. */
export async function unreadGroupIds(userId: string): Promise<string[]> {
  const groupIds = await memberGroupIds(userId);
  if (groupIds.length === 0) return [];

  const [membershipsResult, blocked, hidden] = await Promise.all([
    supabaseAdmin
      .from('group_members')
      .select('group_id, last_read_at')
      .eq('user_id', userId)
      .in('group_id', groupIds),
    blockedUserIds(userId),
    hiddenContentIds(userId, 'message'),
  ]);
  if (membershipsResult.error) {
    console.error('last_read_at', membershipsResult.error);
    return [];
  }

  const ignoreUsers = new Set(blocked);
  const ignoreMessages = new Set(hidden);
  const flagged: string[] = [];

  await Promise.all(
    (membershipsResult.data ?? []).map(async (row) => {
      const groupId = row.group_id as string;
      const lastRead = (row.last_read_at as string | null) ?? '1970-01-01T00:00:00.000Z';
      const { data, error } = await supabaseAdmin
        .from('messages')
        .select('id, user_id')
        .eq('group_id', groupId)
        .neq('user_id', userId)
        .gt('created_at', lastRead)
        .limit(50);
      if (error) {
        console.error('unread messages', error);
        return;
      }
      const hasUnread = (data ?? []).some(
        (message) =>
          !ignoreUsers.has(message.user_id as string) &&
          !ignoreMessages.has(message.id as string),
      );
      if (hasUnread) flagged.push(groupId);
    }),
  );

  return flagged;
}

export async function markGroupRead(userId: string, groupId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('group_members')
    .update({ last_read_at: new Date().toISOString() })
    .eq('group_id', groupId)
    .eq('user_id', userId);
  if (error) console.error('markGroupRead', error);
}
