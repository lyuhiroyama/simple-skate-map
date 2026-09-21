import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../lib/api';
import { hapticClick } from '../lib/haptics';
import { toggleReaction } from '../lib/reactions';
import { confirmBlock, showReasonSheet } from '../lib/safety';
import { assertCleanText } from '../lib/wordFilter';
import { useAuth } from '../context/AuthContext';
import { chatMediaOf, type ChatMedia, type ChatMessage, type Group, type GroupMember } from '../types';
import type { RootStackScreenProps } from '../navigation/types';
import { colors, spacing } from '../theme';
import { MediaLightbox, type LightboxItem } from '../components/MediaLightbox';
import { MessageActionsSheet } from '../components/MessageActionsSheet';

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
  const [inviteOpen, setInviteOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [lightbox, setLightbox] = useState<{ items: LightboxItem[]; index: number } | null>(null);
  const [actionsFor, setActionsFor] = useState<ChatMessage | null>(null);
  const [loading, setLoading] = useState(true);
  const lastOffsetY = useRef(0);
  const nearBottomRef = useRef(true);

  const load = useCallback(async () => {
    try {
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
    } finally {
      setLoading(false);
    }
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

  const inviteCode = group?.inviteCode?.toUpperCase() ?? '';

  const openMedia = useCallback(() => {
    setMenuOpen(false);
    navigation.navigate('GroupMedia', { groupId, groupName: group?.name ?? groupName });
  }, [group, groupId, groupName, navigation]);

  const openInvite = useCallback(() => {
    setMenuOpen(false);
    setInviteOpen(true);
  }, []);

  const openMembers = useCallback(() => {
    setMenuOpen(false);
    setMembersOpen(true);
  }, []);

  useEffect(() => {
    if (!membersOpen) return;
    let cancelled = false;
    setMembersLoading(true);
    api
      .getGroupMembers(groupId)
      .then(({ members: next }) => {
        if (!cancelled) setMembers(next);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          Alert.alert('Could not load members', e instanceof Error ? e.message : 'Unknown error');
        }
      })
      .finally(() => {
        if (!cancelled) setMembersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [membersOpen, groupId]);

  const removeMember = (person: GroupMember) => {
    Alert.alert(`Remove ${person.username}?`, 'They will lose this group and its chat.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.removeGroupMember(groupId, person.userId);
            setMembers((prev) => prev.filter((m) => m.userId !== person.userId));
            setGroup((current) =>
              current ? { ...current, memberCount: Math.max(0, current.memberCount - 1) } : current,
            );
          } catch (e) {
            Alert.alert('Could not remove', e instanceof Error ? e.message : 'Unknown error');
          }
        },
      },
    ]);
  };

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

  const openMessageActions = (item: ChatMessage) => {
    if (item.status === 'sending' || item.status === 'failed') return;
    hapticClick();
    setActionsFor(item);
  };

  const reportMessage = (item: ChatMessage) => {
    showReasonSheet(async (reason) => {
      try {
        await api.report({ contentType: 'message', contentId: item.id, reason });
        setMessages((prev) => prev.filter((m) => m.id !== item.id));
        setLightbox(null);
        Alert.alert('Reported', 'Thanks. You will not see this message.');
      } catch (e) {
        Alert.alert('Could not report', e instanceof Error ? e.message : 'Unknown error');
      }
    });
  };

  const blockSender = (item: ChatMessage) => {
    confirmBlock(item.username, async () => {
      try {
        await api.blockUser(item.userId);
        setMessages((prev) => prev.filter((m) => m.userId !== item.userId));
        setLightbox(null);
      } catch (e) {
        Alert.alert('Could not block', e instanceof Error ? e.message : 'Unknown error');
      }
    });
  };

  const reactTo = async (item: ChatMessage, emoji: string) => {
    const previous = item.reactions;
    setMessages((prev) =>
      prev.map((m) => (m.id === item.id ? { ...m, reactions: toggleReaction(m.reactions, emoji) } : m)),
    );
    try {
      const { reactions } = await api.reactToMessage(groupId, item.id, emoji);
      setMessages((prev) => prev.map((m) => (m.id === item.id ? { ...m, reactions } : m)));
    } catch (e) {
      setMessages((prev) => prev.map((m) => (m.id === item.id ? { ...m, reactions: previous } : m)));
      Alert.alert('Could not react', e instanceof Error ? e.message : 'Unknown error');
    }
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
        contentContainerStyle={[styles.chatContent, loading ? styles.chatLoading : null]}
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
          loading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.primary} size="large" />
            </View>
          ) : (
            <Text style={styles.empty}>No messages yet. Say what you noticed about a place.</Text>
          )
        }
        renderItem={({ item, index }) => {
          const mine = item.userId === myId;
          const prev = messages[index - 1];
          const next = messages[index + 1];
          const firstInBurst = !inBurst(prev, item);
          const lastInBurst = !inBurst(item, next);
          const media = chatMediaOf(item);
          return (
            <View
              style={[
                styles.row,
                mine ? styles.rowMine : styles.rowTheirs,
                firstInBurst ? styles.rowBurst : null,
              ]}
            >
              {mine ? null : (
                <View style={styles.avatarSlot}>
                  {lastInBurst ? (
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{item.username.slice(0, 1).toUpperCase()}</Text>
                    </View>
                  ) : null}
                </View>
              )}
              <View style={[styles.cluster, mine ? styles.clusterMine : null]}>
                {!mine && firstInBurst ? (
                  <View style={styles.senderRow}>
                    <Text style={styles.sender}>{item.username}</Text>
                    <Pressable
                      onPress={() => openMessageActions(item)}
                      hitSlop={8}
                      accessibilityLabel="Report or block"
                    >
                      <Ionicons name="flag-outline" size={12} color={colors.textMuted} />
                    </Pressable>
                  </View>
                ) : null}
                <Pressable
                  onLongPress={() => openMessageActions(item)}
                  delayLongPress={400}
                >
                  <ChatMediaBlock
                    media={media}
                    mine={mine}
                    first={firstInBurst}
                    last={lastInBurst && !item.body && !item.spot}
                    sending={item.status === 'sending'}
                    onLongPress={() => openMessageActions(item)}
                    onOpen={(opened) =>
                      setLightbox({
                        items: media.map((entry) => ({
                          ...entry,
                          messageId: item.id,
                          userId: item.userId,
                          username: item.username,
                        })),
                        index: opened,
                      })
                    }
                  />
                  {item.spot ? (
                    <Pressable
                      onPress={() =>
                        navigation.navigate('SpotDetail', {
                          spotId: item.spot!.id,
                          spotName: item.spot!.name,
                        })
                      }
                      onLongPress={() => openMessageActions(item)}
                      delayLongPress={400}
                      style={[
                        styles.spotCard,
                        mine ? styles.spotCardMine : null,
                        item.spot.media ? styles.spotCardWithMedia : null,
                        cornerStyle(mine, media.length === 0 && firstInBurst, lastInBurst && !item.body),
                        media.length > 0 ? styles.bubbleAfterPhoto : null,
                      ]}
                    >
                      {item.spot.media ? (
                        <View style={styles.spotPreview}>
                          <View pointerEvents="none" style={styles.spotPreviewFill}>
                            {item.spot.media.mediaType === 'video' ? (
                              <ChatVideo url={item.spot.media.url} style={styles.spotPreviewFill} />
                            ) : (
                              <Image
                                source={{ uri: item.spot.media.url }}
                                style={styles.spotPreviewFill}
                              />
                            )}
                          </View>
                          {item.spot.media.mediaType === 'video' ? (
                            <View style={styles.playBadge} pointerEvents="none">
                              <Ionicons name="play" size={22} color="#fff" />
                            </View>
                          ) : null}
                        </View>
                      ) : (
                        <Ionicons
                          name="location-outline"
                          size={18}
                          color={mine ? colors.onPrimary : colors.primary}
                        />
                      )}
                      <View style={styles.spotCardMeta}>
                        <Text
                          style={[styles.spotCardName, mine ? styles.spotCardNameMine : null]}
                          numberOfLines={2}
                        >
                          {item.spot.name}
                        </Text>
                        {item.spot.address ? (
                          <Text
                            style={[styles.spotCardAddress, mine ? styles.spotCardAddressMine : null]}
                            numberOfLines={2}
                          >
                            {item.spot.address}
                          </Text>
                        ) : null}
                      </View>
                    </Pressable>
                  ) : null}
                  {item.body ? (
                    <View
                      style={[
                        styles.bubble,
                        mine ? styles.bubbleMine : styles.bubbleTheirs,
                        cornerStyle(mine, !media.length && !item.spot && firstInBurst, lastInBurst),
                        media.length > 0 || item.spot ? styles.bubbleAfterPhoto : null,
                      ]}
                    >
                      <Text style={[styles.body, mine ? styles.bodyMine : null]}>{item.body}</Text>
                    </View>
                  ) : null}
                </Pressable>
                {(item.reactions ?? []).length > 0 ? (
                  <View style={[styles.reactionRow, mine ? styles.reactionRowMine : null]}>
                    {(item.reactions ?? []).map((reaction) => (
                      <Pressable
                        key={reaction.emoji}
                        onPress={() => void reactTo(item, reaction.emoji)}
                        style={[styles.reactionPill, reaction.me ? styles.reactionPillMine : null]}
                      >
                        <Text style={styles.reactionText}>
                          {reaction.emoji}
                          {reaction.count > 1 ? ` ${reaction.count}` : ''}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
              {mine ? (
                lastInBurst || item.status === 'sending' || item.status === 'failed' ? (
                  <SendReceipt status={item.status} />
                ) : (
                  <View style={styles.receipt} />
                )
              ) : null}
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
            <Pressable onPress={openMembers} style={styles.menuItem} accessibilityLabel="Members">
              <Ionicons name="people-outline" size={18} color={colors.text} />
              <Text style={styles.menuLabel}>Members</Text>
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

      <Modal visible={membersOpen} transparent animationType="fade" onRequestClose={() => setMembersOpen(false)}>
        <View style={styles.inviteBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMembersOpen(false)} />
          <View style={styles.inviteCard}>
            <Text style={styles.inviteTitle}>Members</Text>
            {membersLoading ? (
              <View style={styles.membersLoading}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : (
              <ScrollView style={styles.membersList} bounces={false}>
                {members.map((person) => {
                  const mine = person.userId === myId;
                  const canRemove = group?.myRole === 'owner' && !mine && person.role !== 'owner';
                  return (
                    <View key={person.userId} style={styles.memberRow}>
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>
                          {person.username.slice(0, 1).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.memberMeta}>
                        <Text style={styles.memberName} numberOfLines={1}>
                          {person.username}
                          {mine ? ' (you)' : ''}
                        </Text>
                        {person.role === 'owner' ? (
                          <Text style={styles.memberRole}>Owner</Text>
                        ) : null}
                      </View>
                      {canRemove ? (
                        <Pressable
                          onPress={() => removeMember(person)}
                          hitSlop={8}
                          accessibilityLabel={`Remove ${person.username}`}
                        >
                          <Text style={styles.memberRemove}>Remove</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={inviteOpen} transparent animationType="fade" onRequestClose={() => setInviteOpen(false)}>
        <View style={styles.inviteBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setInviteOpen(false)} />
          <View style={styles.inviteCard}>
            <Text style={styles.inviteTitle}>Invite code</Text>
            <Text style={styles.inviteCode} selectable>
              {inviteCode || 'Unavailable'}
            </Text>
            <Text style={styles.inviteHint}>
              Friends paste this under Invite code on Groups.
            </Text>
            <Pressable
              onPress={() => {
                if (!group || !inviteCode) return;
                void Share.share({
                  message: `Join ${group.name} on Simple Skate Map. Invite code: ${inviteCode}`,
                });
              }}
              style={styles.inviteShare}
              accessibilityLabel="Share invite code"
            >
              <Text style={styles.inviteShareText}>Share</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <MediaLightbox
        items={lightbox?.items ?? null}
        index={lightbox?.index ?? 0}
        myId={myId}
        onClose={() => setLightbox(null)}
        onSafety={(target) => {
          const msg = messages.find((m) => m.id === target.messageId);
          if (msg) {
            hapticClick();
            setLightbox(null);
            setActionsFor(msg);
          }
        }}
      />
      <MessageActionsSheet
        visible={actionsFor != null}
        mine={actionsFor?.userId === myId}
        canCopy={Boolean(actionsFor?.body)}
        myEmoji={actionsFor?.reactions?.find((r) => r.me)?.emoji}
        onClose={() => setActionsFor(null)}
        onReact={(emoji) => {
          if (!actionsFor) return;
          const target = actionsFor;
          setActionsFor(null);
          void reactTo(target, emoji);
        }}
        onCopy={() => {
          if (actionsFor?.body) void Clipboard.setStringAsync(actionsFor.body);
          setActionsFor(null);
        }}
        onReport={() => {
          const target = actionsFor;
          setActionsFor(null);
          if (target) reportMessage(target);
        }}
        onBlock={() => {
          const target = actionsFor;
          setActionsFor(null);
          if (target) blockSender(target);
        }}
      />

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

const BURST_MS = 60_000;
const BUBBLE_ROUND = 18;
const BUBBLE_STACK = 8;

function inBurst(a?: ChatMessage, b?: ChatMessage) {
  if (!a || !b || a.userId !== b.userId) return false;
  return Math.abs(Date.parse(a.createdAt) - Date.parse(b.createdAt)) < BURST_MS;
}

function cornerStyle(mine: boolean, first: boolean, last: boolean) {
  if (mine) {
    return {
      borderTopLeftRadius: BUBBLE_ROUND,
      borderBottomLeftRadius: BUBBLE_ROUND,
      borderTopRightRadius: first ? BUBBLE_ROUND : BUBBLE_STACK,
      borderBottomRightRadius: last ? BUBBLE_ROUND : BUBBLE_STACK,
    };
  }
  return {
    borderTopRightRadius: BUBBLE_ROUND,
    borderBottomRightRadius: BUBBLE_ROUND,
    borderTopLeftRadius: first ? BUBBLE_ROUND : BUBBLE_STACK,
    borderBottomLeftRadius: last ? BUBBLE_ROUND : BUBBLE_STACK,
  };
}

function ChatMediaBlock({
  media,
  mine,
  first,
  last,
  sending,
  onOpen,
  onLongPress,
}: {
  media: ChatMedia[];
  mine: boolean;
  first: boolean;
  last: boolean;
  sending: boolean;
  onOpen: (index: number) => void;
  onLongPress?: () => void;
}) {
  if (media.length === 0) return null;
  const sendingStyle = sending ? styles.photoSending : null;
  if (media.length === 1) {
    const item = media[0];
    return (
      <Pressable
        onPress={() => onOpen(0)}
        onLongPress={onLongPress}
        delayLongPress={400}
        style={[styles.album, cornerStyle(mine, first, last), sendingStyle]}
      >
        {item.mediaType === 'video' ? (
          <>
            <View pointerEvents="none">
              <ChatVideo url={item.url} style={styles.photo} />
            </View>
            <View style={styles.playBadge} pointerEvents="none">
              <Ionicons name="play" size={22} color="#fff" />
            </View>
          </>
        ) : (
          <Image source={{ uri: item.url }} style={styles.photo} />
        )}
      </Pressable>
    );
  }
  const visible = media.slice(0, 4);
  const extra = media.length - visible.length;
  return (
    <View style={[styles.album, cornerStyle(mine, first, last), sendingStyle]}>
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
              onPress={() => onOpen(index)}
              onLongPress={onLongPress}
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
  onPress,
  onLongPress,
}: {
  item: ChatMedia;
  extra: number;
  width: number;
  height: number;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={400} style={{ height, width }}>
      <View pointerEvents="none" style={styles.albumFill}>
        {item.mediaType === 'video' ? (
          <ChatVideo url={item.url} style={styles.albumFill} />
        ) : (
          <Image source={{ uri: item.url }} style={styles.albumFill} />
        )}
      </View>
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
    </Pressable>
  );
}

function ChatVideo({
  url,
  style,
}: {
  url: string;
  style: StyleProp<ViewStyle>;
}) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
  });
  return <VideoView player={player} style={style} contentFit="cover" nativeControls={false} />;
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
  chatLoading: {
    justifyContent: 'center',
  },
  empty: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: spacing.lg,
    textAlign: 'center',
  },
  loading: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    marginTop: 2,
    maxWidth: '100%',
  },
  rowBurst: {
    marginTop: 10,
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
  reactionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
  },
  reactionRowMine: {
    justifyContent: 'flex-end',
  },
  reactionPill: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 12,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  reactionPillMine: {
    backgroundColor: colors.border,
  },
  reactionText: {
    color: colors.text,
    fontSize: 13,
  },
  senderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    marginBottom: 4,
    marginLeft: 2,
  },
  sender: {
    color: colors.textMuted,
    fontSize: 11,
  },
  photo: {
    backgroundColor: colors.surface,
    height: 220,
    width: 220,
  },
  photoSending: {
    opacity: 0.72,
  },
  album: {
    backgroundColor: colors.surface,
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
  },
  bubbleTheirs: {
    backgroundColor: colors.surfaceLight,
  },
  bubbleAfterPhoto: {
    marginTop: 6,
  },
  spotCard: {
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    flexDirection: 'row',
    gap: 10,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 12,
    width: ALBUM_SIZE,
  },
  spotCardWithMedia: {
    alignItems: 'stretch',
    flexDirection: 'column',
    gap: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  spotCardMine: {
    backgroundColor: colors.primary,
  },
  spotPreview: {
    backgroundColor: colors.surface,
    height: ALBUM_SIZE,
    width: ALBUM_SIZE,
  },
  spotPreviewFill: {
    height: '100%',
    width: '100%',
  },
  spotCardMeta: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  spotCardName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  spotCardNameMine: {
    color: colors.onPrimary,
  },
  spotCardAddress: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  spotCardAddressMine: {
    color: colors.onPrimary,
    opacity: 0.75,
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
  inviteBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  inviteCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    gap: spacing.sm,
    maxWidth: 360,
    padding: spacing.lg,
    width: '100%',
  },
  inviteTitle: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  inviteCode: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  inviteHint: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  inviteShare: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 12,
    marginTop: spacing.xs,
    paddingVertical: 12,
  },
  inviteShareText: {
    color: colors.onPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  membersLoading: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  membersList: {
    maxHeight: 320,
  },
  memberRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 10,
  },
  memberMeta: {
    flex: 1,
    minWidth: 0,
  },
  memberName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  memberRole: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  memberRemove: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '600',
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
