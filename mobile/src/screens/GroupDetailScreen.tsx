import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
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
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../lib/api';
import { confirmBlock, showReportBlockSheet } from '../lib/safety';
import { assertCleanText } from '../lib/wordFilter';
import { useAuth } from '../context/AuthContext';
import { chatMediaOf, type ChatMedia, type ChatMessage, type Group } from '../types';
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
  const [pendingMedia, setPendingMedia] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [sending, setSending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
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

  const onChatScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const y = contentOffset.y;
    const dy = y - lastOffsetY.current;
    lastOffsetY.current = y;
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - y;
    nearBottomRef.current = distanceFromBottom < 64;
    if (dy < -24) Keyboard.dismiss();
  };

  const send = async () => {
    const body = draft.trim();
    const assets = [...pendingMedia];
    if ((!body && assets.length === 0) || sending) return;
    const userId = session?.user.id;
    if (!userId) return;

    try {
      if (body) assertCleanText(body, 'Message');
    } catch (e) {
      Alert.alert('Could not send', e instanceof Error ? e.message : 'Unknown error');
      return;
    }

    setSending(true);
    setDraft('');
    setPendingMedia([]);

    const username = myUsername.trim() || 'you';
    const media = assets.map((asset) => ({
      url: asset.uri,
      mediaType: (asset.type === 'video' ? 'video' : 'photo') as ChatMedia['mediaType'],
    }));
    const local: ChatMessage = {
      id: `local-${Date.now()}`,
      groupId,
      userId,
      username,
      body,
      createdAt: new Date().toISOString(),
      media,
      imageUrl: media[0]?.url,
      status: 'sending',
    };

    setMessages((prev) => [...prev, local]);
    setSending(false);
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));

    try {
      const { message } = await api.sendMessage(groupId, {
        body: body || undefined,
        assets: assets.map((asset) => ({
          uri: asset.uri,
          mediaType: asset.type === 'video' ? 'video' : 'photo',
          mimeType: asset.mimeType,
        })),
      });
      setMessages((prev) =>
        prev.map((m) =>
          m.id === local.id
            ? {
                ...message,
                media: message.media?.length ? message.media : media,
                imageUrl: message.imageUrl ?? media[0]?.url,
                status: 'sent',
              }
            : m,
        ),
      );
    } catch (e) {
      setMessages((prev) => prev.map((m) => (m.id === local.id ? { ...m, status: 'failed' } : m)));
      Alert.alert('Could not send', e instanceof Error ? e.message : 'Unknown error');
    }
  };

  const attachMedia = async (from: 'library' | 'camera') => {
    if (sending) return;
    try {
      if (from === 'library') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Permission needed', 'Allow photo library access to send photos and videos.');
          return;
        }
      } else {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Permission needed', 'Allow camera access to take photos and videos.');
          return;
        }
      }
      const result =
        from === 'library'
          ? await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images', 'videos'],
              allowsMultipleSelection: true,
              selectionLimit: 8,
              quality: 0.8,
              videoMaxDuration: 60,
            })
          : await ImagePicker.launchCameraAsync({
              mediaTypes: ['images', 'videos'],
              quality: 0.8,
              videoMaxDuration: 60,
            });
      if (result.canceled || result.assets.length === 0) return;
      setPendingMedia((prev) => [...prev, ...result.assets].slice(0, 8));
    } catch (e) {
      Alert.alert('Could not add media', e instanceof Error ? e.message : 'Unknown error');
    }
  };

  const myId = session?.user.id;

  const onMessageSafety = (item: ChatMessage) => {
    if (item.userId === myId || item.status === 'sending' || item.status === 'failed') return;
    showReportBlockSheet({
      onReport: async (reason) => {
        try {
          await api.report({ contentType: 'message', contentId: item.id, reason });
          setMessages((prev) => prev.filter((m) => m.id !== item.id));
          Alert.alert('Reported', 'Thanks. You will not see this message.');
        } catch (e) {
          Alert.alert('Could not report', e instanceof Error ? e.message : 'Unknown error');
        }
      },
      onBlock: () =>
        confirmBlock(item.username, async () => {
          try {
            await api.blockUser(item.userId);
            setMessages((prev) => prev.filter((m) => m.userId !== item.userId));
          } catch (e) {
            Alert.alert('Could not block', e instanceof Error ? e.message : 'Unknown error');
          }
        }),
    });
  };

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
          const media = chatMediaOf(item);
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
                <Pressable
                  onLongPress={() => onMessageSafety(item)}
                  delayLongPress={350}
                  disabled={mine}
                >
                  <ChatMediaBlock
                    media={media}
                    mine={mine}
                    lastInGroup={lastInGroup}
                    sending={item.status === 'sending'}
                  />
                  {item.body ? (
                    <View
                      style={[
                        styles.bubble,
                        mine ? styles.bubbleMine : styles.bubbleTheirs,
                        mine && lastInGroup && media.length === 0 ? styles.bubbleMineTail : null,
                        !mine && lastInGroup && media.length === 0 ? styles.bubbleTheirsTail : null,
                        media.length > 0 ? styles.bubbleAfterPhoto : null,
                      ]}
                    >
                      <Text style={[styles.body, mine ? styles.bodyMine : null]}>{item.body}</Text>
                    </View>
                  ) : null}
                </Pressable>
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

      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
        {pendingMedia.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.pendingStrip}
            contentContainerStyle={styles.pendingContent}
            keyboardShouldPersistTaps="handled"
          >
            {pendingMedia.map((asset, index) => (
              <Pressable
                key={`${asset.uri}-${index}`}
                onPress={() => setPendingMedia((prev) => prev.filter((_, i) => i !== index))}
                style={styles.pendingThumbWrap}
              >
                <Image source={{ uri: asset.uri }} style={styles.pendingThumb} />
                {asset.type === 'video' ? (
                  <View style={styles.pendingPlay} pointerEvents="none">
                    <Ionicons name="play" size={12} color="#fff" />
                  </View>
                ) : null}
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
        <View style={styles.composerRow}>
          <Pressable
            onPress={() => void attachMedia('camera')}
            hitSlop={8}
            style={styles.mediaBtn}
            accessibilityLabel="Take photo or video"
          >
            <Ionicons name="camera-outline" size={26} color={colors.primary} />
          </Pressable>
          <Pressable
            onPress={() => void attachMedia('library')}
            hitSlop={8}
            style={styles.mediaBtn}
            accessibilityLabel="Add photos or videos"
          >
            <Ionicons name="image-outline" size={26} color={colors.primary} />
          </Pressable>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Message..."
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            multiline
          />
          <Pressable
            onPress={send}
            disabled={(!draft.trim() && pendingMedia.length === 0) || sending}
            accessibilityLabel="Send"
            style={[
              styles.send,
              (!draft.trim() && pendingMedia.length === 0) || sending ? styles.sendOff : null,
            ]}
          >
            <Ionicons name="arrow-up" size={20} color={colors.onPrimary} />
          </Pressable>
        </View>
      </View>
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

const ALBUM_SIZE = 220;
const ALBUM_GAP = 2;
const ALBUM_HALF = (ALBUM_SIZE - ALBUM_GAP) / 2;

function ChatMediaBlock({
  media,
  mine,
  lastInGroup,
  sending,
}: {
  media: ChatMedia[];
  mine: boolean;
  lastInGroup: boolean;
  sending: boolean;
}) {
  if (media.length === 0) return null;
  const tail = lastInGroup ? (mine ? styles.photoMineTail : styles.photoTheirsTail) : null;
  const sendingStyle = sending ? styles.photoSending : null;
  if (media.length === 1) {
    const item = media[0];
    if (item.mediaType === 'video') {
      return (
        <View style={[styles.album, tail, sendingStyle]}>
          <ChatVideo url={item.url} style={styles.photo} controls />
        </View>
      );
    }
    return <Image source={{ uri: item.url }} style={[styles.photo, tail, sendingStyle]} />;
  }
  const visible = media.slice(0, 4);
  const extra = media.length - visible.length;
  return (
    <View style={[styles.album, tail, sendingStyle]}>
      <View style={styles.albumGrid}>
        {visible.map((item, index) => {
          const isLastVisible = index === visible.length - 1;
          const wide = visible.length === 3 && index === 2;
          return (
            <ChatAlbumTile
              key={`${item.url}-${index}`}
              item={item}
              extra={isLastVisible && extra > 0 ? extra : 0}
              width={wide ? ALBUM_SIZE : ALBUM_HALF}
              height={ALBUM_HALF}
            />
          );
        })}
      </View>
    </View>
  );
}

function ChatAlbumTile({
  item,
  extra,
  width,
  height,
}: {
  item: ChatMedia;
  extra: number;
  width: number;
  height: number;
}) {
  return (
    <View style={{ height, width }}>
      {item.mediaType === 'video' ? (
        <ChatVideo url={item.url} style={styles.albumFill} />
      ) : (
        <Image source={{ uri: item.url }} style={styles.albumFill} />
      )}
      {item.mediaType === 'video' && extra === 0 ? (
        <View style={styles.playBadge} pointerEvents="none">
          <Ionicons name="play" size={16} color="#fff" />
        </View>
      ) : null}
      {extra > 0 ? (
        <View style={styles.extraOverlay} pointerEvents="none">
          <Text style={styles.extraText}>+{extra}</Text>
        </View>
      ) : null}
    </View>
  );
}

function ChatVideo({
  url,
  style,
  controls = false,
}: {
  url: string;
  style: StyleProp<ViewStyle>;
  controls?: boolean;
}) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
  });
  return (
    <VideoView player={player} style={style} contentFit="cover" nativeControls={controls} />
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
  album: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    overflow: 'hidden',
    width: ALBUM_SIZE,
  },
  albumGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: ALBUM_GAP,
  },
  albumFill: {
    height: '100%',
    width: '100%',
  },
  playBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.28)',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  extraOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  extraText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
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
    backgroundColor: colors.background,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
  },
  composerRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    flexShrink: 0,
    gap: 8,
  },
  mediaBtn: {
    alignItems: 'center',
    flexShrink: 0,
    height: 44,
    justifyContent: 'center',
    width: 32,
  },
  pendingStrip: {
    marginBottom: 8,
  },
  pendingContent: {
    alignItems: 'center',
    gap: 6,
  },
  pendingThumbWrap: {
    height: 44,
    overflow: 'hidden',
    width: 44,
  },
  pendingThumb: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    height: 44,
    width: 44,
  },
  pendingPlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderRadius: 8,
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    color: colors.text,
    flex: 1,
    flexShrink: 1,
    fontSize: 16,
    maxHeight: 120,
    minHeight: 44,
    minWidth: 0,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  send: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 18,
    flexShrink: 0,
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
