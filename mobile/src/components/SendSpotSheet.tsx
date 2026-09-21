import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from './ui';
import type { Group } from '../types';
import { colors, radius, spacing } from '../theme';

const SCREEN_H = Dimensions.get('window').height;
const PICKER_H = Math.round(SCREEN_H * 0.5);
const COLS = 3;

export function SendSpotSheet({
  visible,
  groups,
  sending,
  onClose,
  onSend,
}: {
  visible: boolean;
  groups: Group[];
  sending: boolean;
  onClose: () => void;
  onSend: (groupIds: string[], body: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const pickerY = useRef(new Animated.Value(PICKER_H)).current;
  const composerY = useRef(new Animated.Value(180)).current;
  const [selected, setSelected] = useState<string[]>([]);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (visible) {
      setSelected([]);
      setDraft('');
    }
    Animated.timing(pickerY, {
      toValue: visible ? 0 : PICKER_H,
      duration: 280,
      useNativeDriver: true,
    }).start();
  }, [visible, pickerY]);

  useEffect(() => {
    Animated.timing(composerY, {
      toValue: visible && selected.length > 0 ? 0 : 180,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [composerY, selected.length, visible]);

  const tileW = useMemo(() => {
    const inner = Dimensions.get('window').width - spacing.lg * 2;
    return Math.floor(inner / COLS);
  }, []);

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]));
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <Animated.View
          style={[
            styles.picker,
            { height: PICKER_H, paddingBottom: Math.max(insets.bottom, spacing.md), transform: [{ translateY: pickerY }] },
          ]}
        >
          <View style={styles.handle} />
          <Text style={styles.title}>Send to</Text>
          {groups.length === 0 ? (
            <Text style={styles.empty}>Join a group to send this pin.</Text>
          ) : (
            <ScrollView
              contentContainerStyle={[
                styles.grid,
                { paddingBottom: selected.length > 0 ? 150 : spacing.md },
              ]}
            >
              {groups.map((group) => {
                const on = selected.includes(group.id);
                return (
                  <Pressable
                    key={group.id}
                    onPress={() => toggle(group.id)}
                    style={[styles.tile, { width: tileW }]}
                    accessibilityLabel={group.name}
                    accessibilityState={{ selected: on }}
                  >
                    <View style={[styles.avatar, on ? styles.avatarOn : null]}>
                      <Text style={styles.avatarText}>{group.name.slice(0, 1).toUpperCase()}</Text>
                    </View>
                    <Text style={styles.tileName} numberOfLines={2}>
                      {group.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </Animated.View>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          pointerEvents={selected.length > 0 ? 'auto' : 'none'}
          style={styles.composerWrap}
        >
          <Animated.View
            style={[
              styles.composer,
              { paddingBottom: Math.max(insets.bottom, spacing.md), transform: [{ translateY: composerY }] },
            ]}
          >
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Write a message..."
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              multiline
            />
            <Button
              title={sending ? 'Sending' : 'Send'}
              onPress={() => onSend(selected, draft.trim())}
              loading={sending}
              disabled={selected.length === 0 || sending}
            />
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  picker: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: spacing.sm,
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: colors.border,
    borderRadius: 2,
    height: 4,
    marginBottom: spacing.sm,
    width: 36,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  empty: {
    color: colors.textMuted,
    fontSize: 15,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.sm,
  },
  tile: {
    alignItems: 'center',
    marginBottom: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderColor: 'transparent',
    borderRadius: 36,
    borderWidth: 3,
    height: 72,
    justifyContent: 'center',
    marginBottom: 8,
    width: 72,
  },
  avatarOn: {
    borderColor: colors.primary,
  },
  avatarText: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
  },
  tileName: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  composerWrap: {
    left: 0,
    position: 'absolute',
    right: 0,
    bottom: 0,
  },
  composer: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  input: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    maxHeight: 88,
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
});
