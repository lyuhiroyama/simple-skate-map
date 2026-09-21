import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { hapticSelect } from '../lib/haptics';
import { colors, radius, spacing } from '../theme';

export const REACTION_EMOJIS = ['❤️', '🔥', '😭', '👍', '🙏', '💩'] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export function MessageActionsSheet({
  visible,
  mine,
  canCopy,
  myEmoji,
  onClose,
  onReact,
  onCopy,
  onReport,
  onBlock,
}: {
  visible: boolean;
  mine: boolean;
  canCopy: boolean;
  myEmoji?: string;
  onClose: () => void;
  onReact: (emoji: ReactionEmoji) => void;
  onCopy?: () => void;
  onReport?: () => void;
  onBlock?: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Dismiss" />
        <View style={styles.stack} pointerEvents="box-none">
          <View style={styles.emojiBar}>
            {REACTION_EMOJIS.map((emoji) => {
              const selected = myEmoji === emoji;
              return (
                <Pressable
                  key={emoji}
                  onPress={() => {
                    hapticSelect();
                    onReact(emoji);
                  }}
                  style={[styles.emojiBtn, selected ? styles.emojiBtnOn : null]}
                  accessibilityLabel={`React ${emoji}`}
                >
                  <Text style={styles.emoji}>{emoji}</Text>
                </Pressable>
              );
            })}
          </View>
          {canCopy || !mine ? (
            <View style={styles.menu}>
              {canCopy ? (
                <Pressable
                  onPress={() => {
                    hapticSelect();
                    onCopy?.();
                  }}
                  style={styles.row}
                  accessibilityLabel="Copy"
                >
                  <Text style={styles.rowLabel}>Copy</Text>
                  <Ionicons name="copy-outline" size={20} color={colors.text} />
                </Pressable>
              ) : null}
              {!mine ? (
                <>
                  {canCopy ? <View style={styles.divider} /> : null}
                  <Pressable onPress={onReport} style={styles.row} accessibilityLabel="Report">
                    <Text style={styles.rowLabel}>Report</Text>
                    <Ionicons name="flag-outline" size={20} color={colors.text} />
                  </Pressable>
                  <View style={styles.divider} />
                  <Pressable onPress={onBlock} style={styles.row} accessibilityLabel="Block">
                    <Text style={styles.rowDanger}>Block</Text>
                    <Ionicons name="hand-left-outline" size={20} color={colors.danger} />
                  </Pressable>
                </>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.46)',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  stack: {
    alignItems: 'center',
    gap: 12,
    width: '100%',
  },
  emojiBar: {
    backgroundColor: colors.surfaceLight,
    borderRadius: radius.full,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  emojiBtn: {
    alignItems: 'center',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  emojiBtnOn: {
    backgroundColor: colors.selected,
  },
  emoji: {
    fontSize: 26,
  },
  menu: {
    alignSelf: 'center',
    backgroundColor: colors.surfaceLight,
    borderRadius: 14,
    minWidth: 230,
    overflow: 'hidden',
    width: 260,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowLabel: {
    color: colors.text,
    fontSize: 17,
  },
  rowDanger: {
    color: colors.danger,
    fontSize: 17,
  },
  divider: {
    backgroundColor: colors.border,
    height: StyleSheet.hairlineWidth,
    marginLeft: 16,
  },
});
