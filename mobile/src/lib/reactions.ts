import type { MessageReaction } from '../types';

export function toggleReaction(
  reactions: MessageReaction[] | undefined,
  emoji: string,
): MessageReaction[] {
  const list = reactions ?? [];
  const mine = list.find((r) => r.me);
  const withoutMe = list
    .map((r) => (r.me ? { ...r, count: r.count - 1, me: false } : r))
    .filter((r) => r.count > 0);
  if (mine?.emoji === emoji) return withoutMe;
  const existing = withoutMe.find((r) => r.emoji === emoji);
  if (existing) {
    return withoutMe.map((r) => (r.emoji === emoji ? { ...r, count: r.count + 1, me: true } : r));
  }
  return [...withoutMe, { emoji, count: 1, me: true }];
}
