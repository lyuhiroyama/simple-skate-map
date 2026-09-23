export const DELETED_DISPLAY_NAME = 'Deleted Account';

type ProfileName = {
  username?: string | null;
  deleted_at?: string | null;
} | null;

export function publicUsername(profile: ProfileName): string {
  if (!profile) return 'unknown';
  const name = profile.username?.trim();
  if (profile.deleted_at || name?.startsWith('deleted_')) return DELETED_DISPLAY_NAME;
  return name || 'unknown';
}

export function tombstoneUsername(userId: string): string {
  return `deleted_${userId.replace(/-/g, '').slice(0, 8)}`;
}
