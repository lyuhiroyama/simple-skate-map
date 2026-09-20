import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type { ChatMessage, Group } from '../types';
import type { RootStackScreenProps } from '../navigation/types';
import { colors, spacing } from '../theme';

export function GroupDetailScreen({ route, navigation }: RootStackScreenProps<'GroupDetail'>) {
  const { groupId, groupName } = route.params;
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const [group, setGroup] = useState<Group | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [myUsername, setMyUsername] = useState('you');
  const [draft, setDraft] = useState('');
  const [pendingPhotos, setPendingPhotos] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [sending, setSending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [composerVisible, setComposerVisible] = useState(true);
  const composerVisibleRef = useRef(true);
  const lastOffsetY = useRef(0);
  const nearBottomRef = useRef(true);

  const load = useCallback(async () => {
    const [groupsRes, messagesRes, me] = await Promise.all([
      api.getGroups(),
      api.getMessages(groupId),
      api.getMe(),
    ]);
    setGroup(groupsRes.groups.find((g) => g.id === groupId) ?? null);
    setMyUsername(me.profile.username);
    setMessages((prev) => {
      const inFlight = prev.filter((m) => m.status === 'sending' || m.status === 'failed');
      const incoming = messagesRes.messages.map((m) => ({ ...m, status: 'sent' as const }));
      const incomingIds = new Set(incoming.map((m) => m.id));
      return [...incoming, ...inFlight.filter((m) => !incomingIds.has(m.id))];
    });
  }, [groupId]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      load().catch((e: unknown) => {
        if (!cancelled) {
          Alert.alert('Could not load group', e instanceof Error ? e.message : 'Unknown error');
        }
      });
      return () => {
        cancelled = true;
      };
    }, [load]),
  );

  const shareInvite = useCallback(async () => {
    if (!group) return;
    await Share.share({
      message: `Join ${group.name} on Simple Skate Map. Invite code: ${group.inviteCode}`,
    });
  }, [group]);

  const openMedia = useCallback(() => {
    setMenuOpen(false);
    navigation.navigate('GroupMedia', { groupId, groupName: group?.name ?? groupName });
  }, [group, groupId, groupName, navigation]);

  const openInvite = useCallback(() => {
    setMenuOpen(false);
    void shareInvite();
  }, [shareInvite]);

  const leaveGroup = useCallback(() => {
    setMenuOpen(false);
    Alert.alert('Leave group?', 'You will stop seeing its spots on your map.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.leaveGroup(groupId);
            navigation.goBack();
          } catch (e) {
            Alert.alert('Could not leave', e instanceof Error ? e.message : 'Unknown error');
          }
        },
      },
    ]);
  }, [groupId, navigation]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => setMenuOpen((open) => !open)}
          hitSlop={12}
          accessibilityLabel="Group options"
        >
          <Ionicons name="information-circle-outline" size={26} color={colors.primary} />
        </Pressable>
      ),
    });
  }, [navigation]);

  const setComposer = (visible: boolean) => {
    if (composerVisibleRef.current === visible) return;
    composerVisibleRef.current = visible;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (!visible) Keyboard.dismiss();
    setComposerVisible(visible);
  };

  const onChatScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const y = contentOffset.y;
    const dy = y - lastOffsetY.current;
    lastOffsetY.current = y;
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - y;
    nearBottomRef.current = distanceFromBottom < 64;
    if (nearBottomRef.current) {
      setComposer(true);
      return;
    }
    if (dy < -24) setComposer(false);
    if (dy > 24) setComposer(true);
  };

  const send = async () => {
    const body = draft.trim();
    const photos = [...pendingPhotos];
    if ((!body && photos.length === 0) || sending) return;
    const userId = session?.user.id;
    if (!userId) return;

    setSending(true);
    setDraft('');
    setPendingPhotos([]);

    const username = myUsername.trim() || 'you';
    const now = Date.now();
    const outgoing: ChatMessage[] = [];
    if (body) {
      outgoing.push({
        id: `local-${now}-text`,
        groupId,
        userId,
        username,
        body,
        createdAt: new Date().toISOString(),
        status: 'sending',
      });
    }
    photos.forEach((photo, index) => {
      outgoing.push({
        id: `local-${now}-photo-${index}`,
        groupId,
        userId,
        username,
        body: '',
        createdAt: new Date().toISOString(),
        imageUrl: photo.uri,
        status: 'sending',
      });
    });

    setMessages((prev) => [...prev, ...outgoing]);
    setSending(false);
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));

    for (const item of outgoing) {
      try {
        const { message } = await api.sendMessage(groupId, {
          body: item.body || undefined,
          imageUri: item.imageUrl,
        });
        setMessages((prev) =>
          prev.map((m) =>
            m.id === item.id
              ? {
                  ...message,
                  imageUrl: message.imageUrl ?? item.imageUrl,
                  status: 'sent',
                }
              : m,
          ),
        );
      } catch (e) {
        setMessages((prev) =>
          prev.map((m) => (m.id === item.id ? { ...m, status: 'failed' } : m)),
        );
        Alert.alert('Could not send', e instanceof Error ? e.message : 'Unknown error');
      }
    }
  };

  const attachPhotos = async (from: 'library' | 'camera') => {
    if (sending) return;
    try {
      if (from === 'library') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Permission needed', 'Allow photo library access to send a picture.');
          return;
        }
      } else {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Permission needed', 'Allow camera access to take a picture.');
          return;
        }
      }
      const result =
        from === 'library'
          ? await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              allowsMultipleSelection: true,
              selectionLimit: 8,
              quality: 0.8,
            })
          : await ImagePicker.launchCameraAsync({ quality: 0.8 });
      if (result.canceled || result.assets.length === 0) return;
      setPendingPhotos((prev) => [...prev, ...result.assets].slice(0, 8));
    } catch (e) {
      Alert.alert('Could not add photos', e instanceof Error ? e.message : 'Unknown error');
    }
  };

  const openPhotoPicker = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', 'Take photo', 'Choose from library'], cancelButtonIndex: 0 },
        (index) => {
          if (index === 1) void attachPhotos('camera');
          if (index === 2) void attachPhotos('library');
        },
      );
      return;
    }
    Alert.alert('Add photos', undefined, [
      { text: 'Take photo', onPress: () => void attachPhotos('camera') },
      { text: 'Choose from library', onPress: () => void attachPhotos('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const myId = session?.user.id;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <FlatList
        ref={listRef}
        style={styles.chat}
        contentContainerStyle={styles.chatContent}
        data={messages}
        keyExtractor={(m) => m.id}
        onContentSizeChange={() => {
          if (nearBottomRef.current) listRef.current?.scrollToEnd({ animated: false });
        }}
        onScroll={onChatScroll}
        scrollEventThrottle={16}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <Text style={styles.empty}>No messages yet. Say what you noticed about a place.</Text>
        }
        renderItem={({ item, index }) => {
          const mine = item.userId === myId;
          const prev = messages[index - 1];
          const next = messages[index + 1];
          const firstInGroup = !prev || prev.userId !== item.userId;
          const lastInGroup = !next || next.userId !== item.userId;
          return (
            <View
              style={[
                styles.row,
                mine ? styles.rowMine : styles.rowTheirs,
                firstInGroup ? styles.rowFirst : null,
              ]}
            >
              {mine ? null : (
                <View style={styles.avatarSlot}>
                  {lastInGroup ? (
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{item.username.slice(0, 1).toUpperCase()}</Text>
                    </View>
                  ) : null}
                </View>
              )}
              <View style={[styles.cluster, mine ? styles.clusterMine : null]}>
                {!mine && firstInGroup ? <Text style={styles.sender}>{item.username}</Text> : null}
                {item.imageUrl ? (
                  <Image
                    source={{ uri: item.imageUrl }}
                    style={[
                      styles.photo,
                      mine && lastInGroup ? styles.photoMineTail : null,
                      !mine && lastInGroup ? styles.photoTheirsTail : null,
                      item.status === 'sending' ? styles.photoSending : null,
                    ]}
                  />
                ) : null}
                {item.body ? (
                  <View
                    style={[
                      styles.bubble,
                      mine ? styles.bubbleMine : styles.bubbleTheirs,
                      mine && lastInGroup && !item.imageUrl ? styles.bubbleMineTail : null,
                      !mine && lastInGroup && !item.imageUrl ? styles.bubbleTheirsTail : null,
                      item.imageUrl ? styles.bubbleAfterPhoto : null,
                    ]}
                  >
                    <Text style={[styles.body, mine ? styles.bodyMine : null]}>{item.body}</Text>
                  </View>
                ) : null}
              </View>
              {mine ? <SendReceipt status={item.status} /> : null}
            </View>
          );
        }}
      />

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <View style={styles.menuBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenuOpen(false)} />
          <View style={[styles.menu, { top: insets.top + 48, right: spacing.sm }]}>
            <Pressable onPress={openMedia} style={styles.menuItem} accessibilityLabel="Media">
              <Ionicons name="images-outline" size={18} color={colors.text} />
              <Text style={styles.menuLabel}>Media</Text>
            </Pressable>
            <Pressable onPress={openInvite} style={styles.menuItem} accessibilityLabel="Invite">
              <Ionicons name="person-add-outline" size={18} color={colors.text} />
              <Text style={styles.menuLabel}>Invite</Text>
            </Pressable>
            <View style={styles.menuDivider} />
            <Pressable onPress={leaveGroup} style={styles.menuItem} accessibilityLabel="Leave">
              <Ionicons name="exit-outline" size={18} color={colors.danger} />
              <Text style={styles.menuLabelDanger}>Leave</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {composerVisible ? (
        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
          <Pressable onPress={openPhotoPicker} hitSlop={8} style={styles.mediaBtn} accessibilityLabel="Add photos">
            <Ionicons name="image-outline" size={26} color={colors.primary} />
          </Pressable>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onFocus={() => setComposer(true)}
            placeholder="Message..."
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            multiline
          />
          {pendingPhotos.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.pendingStrip}
              contentContainerStyle={styles.pendingContent}
              keyboardShouldPersistTaps="handled"
            >
              {pendingPhotos.map((photo, index) => (
                <Pressable
                  key={`${photo.uri}-${index}`}
                  onPress={() => setPendingPhotos((prev) => prev.filter((_, i) => i !== index))}
                  style={styles.pendingThumbWrap}
                >
                  <Image source={{ uri: photo.uri }} style={styles.pendingThumb} />
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
          <Pressable
            onPress={send}
            disabled={(!draft.trim() && pendingPhotos.length === 0) || sending}
            style={[
              styles.send,
              (!draft.trim() && pendingPhotos.length === 0) || sending ? styles.sendOff : null,
            ]}
          >
            <Ionicons name="arrow-up" size={20} color={colors.onPrimary} />
          </Pressable>
        </View>
      ) : (
        <Pressable
          onPress={() => setComposer(true)}
          style={[styles.composerPeek, { height: Math.max(insets.bottom, spacing.md) }]}
          accessibilityLabel="Show message box"
        />
      )}
    </KeyboardAvoidingView>
  );
}

function SendReceipt({ status }: { status?: ChatMessage['status'] }) {
  const sending = status === 'sending';
  const failed = status === 'failed';
  return (
    <View
      style={[
        styles.receipt,
        sending ? styles.receiptSending : null,
        !sending && !failed ? styles.receiptSent : null,
        failed ? styles.receiptFailed : null,
      ]}
      accessibilityLabel={failed ? 'Failed to send' : sending ? 'Sending' : 'Sent'}
    >
      <Ionicons
        name={failed ? 'close' : 'checkmark'}
        size={9}
        color={failed ? colors.danger : sending ? colors.primary : colors.onPrimary}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.background,
    flex: 1,
  },
  chat: {
    flex: 1,
  },
  chatContent: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
  },
  empty: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: spacing.lg,
    textAlign: 'center',
  },
  row: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    marginTop: 2,
    maxWidth: '100%',
  },
  rowFirst: {
    marginTop: 12,
  },
  rowMine: {
    justifyContent: 'flex-end',
  },
  rowTheirs: {
    justifyContent: 'flex-start',
  },
  avatarSlot: {
    marginRight: 6,
    width: 28,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderRadius: 14,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  avatarText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  cluster: {
    maxWidth: '78%',
  },
  clusterMine: {
    alignItems: 'flex-end',
  },
  sender: {
    color: colors.textMuted,
    fontSize: 11,
    marginBottom: 4,
    marginLeft: 12,
  },
  photo: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    height: 220,
    width: 220,
  },
  photoMineTail: {
    borderBottomRightRadius: 6,
  },
  photoTheirsTail: {
    borderBottomLeftRadius: 6,
  },
  photoSending: {
    opacity: 0.72,
  },
  receipt: {
    alignItems: 'center',
    borderRadius: 8,
    height: 16,
    justifyContent: 'center',
    marginBottom: 2,
    marginLeft: 4,
    width: 16,
  },
  receiptSending: {
    backgroundColor: 'transparent',
    borderColor: colors.primary,
    borderWidth: 1.5,
  },
  receiptSent: {
    backgroundColor: colors.primary,
  },
  receiptFailed: {
    backgroundColor: 'transparent',
    borderColor: colors.danger,
    borderWidth: 1.5,
  },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  bubbleMine: {
    backgroundColor: colors.primary,
    borderRadius: 20,
  },
  bubbleTheirs: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 20,
  },
  bubbleMineTail: {
    borderBottomRightRadius: 6,
  },
  bubbleTheirsTail: {
    borderBottomLeftRadius: 6,
  },
  bubbleAfterPhoto: {
    marginTop: 6,
  },
  body: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 21,
  },
  bodyMine: {
    color: colors.onPrimary,
  },
  composer: {
    alignItems: 'flex-end',
    backgroundColor: colors.background,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
  },
  composerPeek: {
    backgroundColor: colors.background,
  },
  mediaBtn: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 32,
  },
  pendingStrip: {
    maxWidth: 132,
  },
  pendingContent: {
    alignItems: 'center',
    gap: 6,
  },
  pendingThumbWrap: {
    height: 44,
    width: 44,
  },
  pendingThumb: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    height: 44,
    width: 44,
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    color: colors.text,
    flex: 1,
    fontSize: 16,
    maxHeight: 120,
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  send: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    marginBottom: 4,
    width: 36,
  },
  sendOff: {
    opacity: 0.35,
  },
  menuBackdrop: {
    flex: 1,
  },
  menu: {
    position: 'absolute',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    minWidth: 168,
    overflow: 'hidden',
    paddingVertical: 4,
  },
  menuItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  menuLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  menuDivider: {
    backgroundColor: colors.border,
    height: StyleSheet.hairlineWidth,
    marginVertical: 4,
  },
  menuLabelDanger: {
    color: colors.danger,
    fontSize: 16,
    fontWeight: '600',
  },
});
