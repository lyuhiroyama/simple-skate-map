import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { hapticSelect } from '../lib/haptics';
import { colors, radius } from '../theme';

export const REACTION_EMOJIS = ['❤️', '🔥', '😭', '👍', '🙏', '💩'] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export type MessageAnchor = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const EMOJI_SIZE = 44;
const EMOJI_PAD_V = 8;
const EMOJI_PAD_H = 8;
const EMOJI_GAP = 4;
const EMOJI_BAR_H = EMOJI_PAD_V * 2 + EMOJI_SIZE;
const EMOJI_BAR_W =
  EMOJI_PAD_H * 2 + REACTION_EMOJIS.length * EMOJI_SIZE + (REACTION_EMOJIS.length - 1) * EMOJI_GAP;
const MENU_W = 260;
const ROW_H = 49;
const GAP = 10;
const SCREEN_PAD = 12;
const OPEN_MS = 280;
const CLOSE_MS = 180;

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

function menuHeight(canCopy: boolean, mine: boolean) {
  let rows = 0;
  if (canCopy) rows += 1;
  if (!mine) rows += 2;
  if (rows === 0) return 0;
  return rows * ROW_H + (rows - 1) * StyleSheet.hairlineWidth;
}

function layoutFor(
  anchor: MessageAnchor | null,
  mine: boolean,
  canCopy: boolean,
  insets: { top: number; bottom: number },
) {
  const { width: screenW, height: screenH } = Dimensions.get('window');
  const topSafe = insets.top + 8;
  const botSafe = screenH - Math.max(insets.bottom, 8) - 8;
  const menuH = menuHeight(canCopy, mine);
  const hasMenu = menuH > 0;

  if (!anchor || anchor.width < 8 || anchor.height < 8) {
    return { mode: 'center' as const, menuH };
  }

  const emojiRoom = EMOJI_BAR_H + GAP;
  const menuRoom = hasMenu ? menuH + GAP : 0;
  let focusY = anchor.y;
  if (focusY - emojiRoom < topSafe) {
    focusY = topSafe + emojiRoom;
  }
  if (focusY + anchor.height + menuRoom > botSafe) {
    focusY = botSafe - menuRoom - anchor.height;
  }
  if (focusY - emojiRoom < topSafe) {
    focusY = clamp(
      anchor.y,
      topSafe,
      Math.max(topSafe, botSafe - Math.min(anchor.height, botSafe - topSafe)),
    );
  }
  const focusX = clamp(anchor.x, SCREEN_PAD, Math.max(SCREEN_PAD, screenW - SCREEN_PAD - anchor.width));

  const emojiX = clamp(
    mine ? anchor.x + anchor.width - EMOJI_BAR_W : anchor.x,
    SCREEN_PAD,
    screenW - SCREEN_PAD - EMOJI_BAR_W,
  );
  const menuX = hasMenu
    ? clamp(mine ? anchor.x + anchor.width - MENU_W : anchor.x, SCREEN_PAD, screenW - SCREEN_PAD - MENU_W)
    : SCREEN_PAD;

  return {
    mode: 'anchor' as const,
    focusX,
    focusY,
    focusW: anchor.width,
    menuH,
    emojiX,
    emojiY: clamp(focusY - GAP - EMOJI_BAR_H, topSafe, botSafe - EMOJI_BAR_H),
    menuX,
    menuY: hasMenu ? clamp(focusY + anchor.height + GAP, topSafe, botSafe - menuH) : 0,
    slideFrom: anchor.y - focusY,
  };
}

export function MessageActionsSheet({
  visible,
  mine,
  canCopy,
  myEmoji,
  anchor,
  preview,
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
  anchor: MessageAnchor | null;
  preview?: React.ReactNode;
  onClose: () => void;
  onReact: (emoji: ReactionEmoji) => void;
  onCopy?: () => void;
  onReport?: () => void;
  onBlock?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const progress = useRef(new Animated.Value(0)).current;
  const closing = useRef(false);
  const layout = useMemo(
    () => layoutFor(anchor, mine, canCopy, insets),
    [anchor, mine, canCopy, insets],
  );

  useEffect(() => {
    if (!visible) {
      progress.setValue(0);
      closing.current = false;
      return;
    }
    closing.current = false;
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: OPEN_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, progress]);

  const finishClose = (then?: () => void) => {
    if (!visible || closing.current) return;
    closing.current = true;
    Animated.timing(progress, {
      toValue: 0,
      duration: CLOSE_MS,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      closing.current = false;
      if (finished) {
        then?.();
        onClose();
      }
    });
  };

  const fade = progress;
  const chromeOpacity = progress.interpolate({
    inputRange: [0, 0.35, 1],
    outputRange: [0, 0.4, 1],
  });
  const previewScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.03],
  });
  const slide = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [layout.mode === 'anchor' ? layout.slideFrom : 12, 0],
  });
  const emojiPop = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [10, 0],
  });
  const menuPop = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-10, 0],
  });
  const centerScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.94, 1],
  });

  const emojiBar = (
    <View style={styles.emojiBar}>
      {REACTION_EMOJIS.map((emoji) => {
        const selected = myEmoji === emoji;
        return (
          <Pressable
            key={emoji}
            onPress={() => {
              hapticSelect();
              finishClose(() => onReact(emoji));
            }}
            style={[styles.emojiBtn, selected ? styles.emojiBtnOn : null]}
            accessibilityLabel={`React ${emoji}`}
          >
            <Text style={styles.emoji}>{emoji}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  const menu =
    canCopy || !mine ? (
      <View style={styles.menu}>
        {canCopy ? (
          <Pressable
            onPress={() => {
              hapticSelect();
              finishClose(() => onCopy?.());
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
            <Pressable
              onPress={() => finishClose(() => onReport?.())}
              style={styles.row}
              accessibilityLabel="Report"
            >
              <Text style={styles.rowLabel}>Report</Text>
              <Ionicons name="flag-outline" size={20} color={colors.text} />
            </Pressable>
            <View style={styles.divider} />
            <Pressable
              onPress={() => finishClose(() => onBlock?.())}
              style={styles.row}
              accessibilityLabel="Block"
            >
              <Text style={styles.rowDanger}>Block</Text>
              <Ionicons name="hand-left-outline" size={20} color={colors.danger} />
            </Pressable>
          </>
        ) : null}
      </View>
    ) : null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
      statusBarTranslucent
      onRequestClose={() => finishClose()}
    >
      <View style={styles.root}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: fade }]}>
          <BlurView
            intensity={Platform.OS === 'ios' ? 64 : 80}
            tint="dark"
            experimentalBlurMethod="dimezisBlurView"
            style={StyleSheet.absoluteFill}
          />
          <View style={[StyleSheet.absoluteFill, styles.dim]} />
        </Animated.View>

        <Pressable style={StyleSheet.absoluteFill} onPress={() => finishClose()} accessibilityLabel="Dismiss" />

        {layout.mode === 'anchor' && anchor ? (
          <>
            <Animated.View
              pointerEvents="box-none"
              style={[
                styles.float,
                {
                  left: layout.emojiX,
                  top: layout.emojiY,
                  opacity: chromeOpacity,
                  transform: [{ translateY: Animated.add(slide, emojiPop) }],
                },
              ]}
            >
              {emojiBar}
            </Animated.View>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.float,
                {
                  left: layout.focusX,
                  top: anchor.y,
                  width: layout.focusW,
                  transform: [
                    { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, -layout.slideFrom] }) },
                    { scale: previewScale },
                  ],
                },
              ]}
            >
              {preview}
            </Animated.View>
            {menu ? (
              <Animated.View
                pointerEvents="box-none"
                style={[
                  styles.float,
                  {
                    left: layout.menuX,
                    top: layout.menuY,
                    opacity: chromeOpacity,
                    transform: [{ translateY: Animated.add(slide, menuPop) }],
                  },
                ]}
              >
                {menu}
              </Animated.View>
            ) : null}
          </>
        ) : (
          <Animated.View
            pointerEvents="box-none"
            style={[
              styles.centerStack,
              {
                opacity: fade,
                transform: [{ translateY: slide }, { scale: centerScale }],
              },
            ]}
          >
            {emojiBar}
            {preview ? <View style={styles.centerPreview}>{preview}</View> : null}
            {menu}
          </Animated.View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  dim: {
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  float: {
    position: 'absolute',
  },
  centerStack: {
    alignItems: 'center',
    bottom: 0,
    gap: 12,
    justifyContent: 'center',
    left: 0,
    paddingHorizontal: 24,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  centerPreview: {
    maxWidth: '100%',
  },
  emojiBar: {
    backgroundColor: colors.surfaceLight,
    borderRadius: radius.full,
    flexDirection: 'row',
    gap: EMOJI_GAP,
    paddingHorizontal: EMOJI_PAD_H,
    paddingVertical: EMOJI_PAD_V,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.38,
    shadowRadius: 18,
    elevation: 12,
  },
  emojiBtn: {
    alignItems: 'center',
    borderRadius: 22,
    height: EMOJI_SIZE,
    justifyContent: 'center',
    width: EMOJI_SIZE,
  },
  emojiBtnOn: {
    backgroundColor: colors.selected,
  },
  emoji: {
    fontSize: 26,
  },
  menu: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 14,
    minWidth: 230,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.38,
    shadowRadius: 18,
    elevation: 12,
    width: MENU_W,
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
