import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../lib/api';
import { alertError, explainError, reportError } from '../lib/errors';
import { reverseGeocodeEnJa } from '../lib/geocode';
import { openInGoogleMaps } from '../lib/maps';
import { blockedNotice, confirmBlock, showReportBlockSheet } from '../lib/safety';
import { useAuth } from '../context/AuthContext';
import { Button, EmptyState } from '../components/ui';
import { SendSpotSheet } from '../components/SendSpotSheet';
import { uploadSpotAsset } from '../lib/upload';
import type { Group, SpotDetail, SpotMedia } from '../types';
import type { RootStackScreenProps } from '../navigation/types';
import { colors, radius, spacing } from '../theme';

const MEDIA_WIDTH = Dimensions.get('window').width - spacing.lg * 2;
const MEDIA_HEIGHT = Math.round(MEDIA_WIDTH * 0.75);
const MEDIA_PAGE = MEDIA_WIDTH + spacing.sm;
const MAX_MEDIA = 8;

export function SpotDetailScreen({ route, navigation }: RootStackScreenProps<'SpotDetail'>) {
  const { spotId } = route.params;
  const { session } = useAuth();
  const [spot, setSpot] = useState<SpotDetail | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [mediaIndex, setMediaIndex] = useState(0);
  const [addingMedia, setAddingMedia] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [addressEn, setAddressEn] = useState<string | null>(null);
  const [addressJa, setAddressJa] = useState<string | null>(null);
  const [addressLoading, setAddressLoading] = useState(false);
  const groupIdsRef = useRef<string[]>([]);
  const shareChain = useRef(Promise.resolve());

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        await shareChain.current.catch(() => undefined);
        if (cancelled) return;
        try {
          const [{ spot: s }, { groups: g }] = await Promise.all([
            api.getSpot(spotId),
            api.getGroups().catch(() => ({ groups: [] as Group[] })),
          ]);
          if (cancelled) return;
          groupIdsRef.current = s.groupIds;
          setSpot(s);
          setGroups(g);
          setMediaIndex(0);
          setError(null);
          setAddressEn(null);
          setAddressJa(null);
          setAddressLoading(true);
          void reverseGeocodeEnJa(s.latitude, s.longitude)
            .then((places) => {
              if (cancelled) return;
              setAddressEn(places.en);
              setAddressJa(places.ja);
            })
            .catch(() => {
              if (cancelled) return;
              setAddressEn(null);
              setAddressJa(null);
            })
            .finally(() => {
              if (!cancelled) setAddressLoading(false);
            });
        } catch (e: unknown) {
          if (!cancelled) {
            reportError('load-spot', e);
            setError(explainError(e, 'Failed to load spot'));
          }
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [spotId]),
  );

  const confirmDelete = () => {
    Alert.alert('Delete spot?', 'This removes the spot and all its photos/videos.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            await api.deleteSpot(spotId);
            navigation.goBack();
          } catch (e) {
            setDeleting(false);
            alertError('Delete failed', e);
          }
        },
      },
    ]);
  };

  const onSpotSafety = () => {
    if (!spot) return;
    showReportBlockSheet({
      onReport: async (reason) => {
        try {
          await api.report({ contentType: 'spot', contentId: spot.id, reason });
          Alert.alert('Reported', 'Thanks. You will not see this spot.');
          navigation.goBack();
        } catch (e) {
          alertError('Could not report', e);
        }
      },
      onBlock: () =>
        confirmBlock(spot.createdByUsername, async () => {
          try {
            await api.blockUser(spot.createdBy);
            blockedNotice();
            navigation.goBack();
          } catch (e) {
            alertError('Could not block', e);
          }
        }),
    });
  };

  if (error) {
    return (
      <View style={styles.center}>
        <EmptyState title="Couldn't load this spot" subtitle={error} />
      </View>
    );
  }

  if (!spot) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const isMine = session?.user.id === spot.createdBy;

  const sendToGroups = async (groupIds: string[], body: string) => {
    if (sending || groupIds.length === 0) return;
    setSending(true);
    try {
      const { groupIds: next } = await api.sendSpot(spotId, { groupIds, body: body || undefined });
      groupIdsRef.current = next;
      setSpot((current) => (current ? { ...current, groupIds: next } : current));
      setSendOpen(false);
    } catch (e) {
      alertError('Could not send', e);
    } finally {
      setSending(false);
    }
  };

  const toggleShare = (groupId: string) => {
    if (!isMine) return;
    const previous = groupIdsRef.current;
    const next = previous.includes(groupId)
      ? previous.filter((id) => id !== groupId)
      : [...previous, groupId];
    groupIdsRef.current = next;
    setSpot((current) => (current ? { ...current, groupIds: next } : current));
    shareChain.current = shareChain.current.catch(() => undefined).then(async () => {
      setSharing(true);
      try {
        const { spot: updated } = await api.updateSpotShares(spot.id, next);
        if (groupIdsRef.current.join() !== next.join()) return;
        groupIdsRef.current = updated.groupIds;
        setSpot((current) => (current ? { ...current, groupIds: updated.groupIds } : current));
      } catch (e) {
        if (groupIdsRef.current.join() !== next.join()) return;
        groupIdsRef.current = previous;
        setSpot((current) => (current ? { ...current, groupIds: previous } : current));
        alertError('Could not update sharing', e);
      } finally {
        setSharing(false);
      }
    });
  };

  const addMedia = async (from: 'library' | 'camera') => {
    if (!isMine || addingMedia) return;
    const remaining = MAX_MEDIA - spot.media.length;
    if (remaining <= 0) {
      Alert.alert('Limit reached', 'A pin can have up to 8 photos or videos.');
      return;
    }
    try {
      if (from === 'library') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Permission needed', 'Allow photo library access to attach media.');
          return;
        }
      } else {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Permission needed', 'Allow camera access to take a photo.');
          return;
        }
      }
      const result =
        from === 'library'
          ? await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images', 'videos'],
              allowsMultipleSelection: true,
              selectionLimit: remaining,
              quality: 0.8,
              videoMaxDuration: 60,
            })
          : await ImagePicker.launchCameraAsync({ quality: 0.8 });
      if (result.canceled || result.assets.length === 0) return;
      const assets = result.assets.slice(0, remaining);
      setAddingMedia(true);
      for (const asset of assets) {
        await uploadSpotAsset(spot.id, asset);
      }
      const { spot: next } = await api.getSpot(spotId);
      groupIdsRef.current = next.groupIds;
      setSpot(next);
      setMediaIndex(Math.max(0, next.media.length - 1));
    } catch (e) {
      alertError('Could not add media', e);
    } finally {
      setAddingMedia(false);
    }
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.name}>{spot.name}</Text>
      <Text style={styles.meta}>
        added by {spot.createdByUsername} · {new Date(spot.createdAt).toLocaleDateString()}
      </Text>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Address</Text>
        <View style={styles.addressBlock}>
          {addressLoading ? (
            <ActivityIndicator color={colors.primary} style={styles.addressSpinner} />
          ) : (
            <>
              <View style={styles.addressLang}>
                <Text style={styles.addressLangLabel}>English</Text>
                <Text style={styles.sectionText}>{addressEn || spot.address || '—'}</Text>
              </View>
              {addressJa && addressJa !== addressEn ? (
                <View style={styles.addressLang}>
                  <Text style={styles.addressLangLabel}>日本語</Text>
                  <Text style={styles.sectionText}>{addressJa}</Text>
                </View>
              ) : null}
            </>
          )}
          <Pressable
            onPress={() =>
              void openInGoogleMaps({
                latitude: spot.latitude,
                longitude: spot.longitude,
                name: spot.name,
              })
            }
            style={styles.mapsRow}
            accessibilityLabel="Open in Google Maps"
          >
            <Ionicons name="map-outline" size={16} color={colors.selected} />
            <Text style={styles.addressLink}>Google Maps</Text>
          </Pressable>
        </View>
      </View>

      {spot.description ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Notes</Text>
          <Text style={styles.sectionText}>{spot.description}</Text>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Photos & videos</Text>
        {spot.media.length === 0 ? (
          <Text style={styles.sectionText}>No media yet.</Text>
        ) : (
          <>
            {spot.media.length > 1 ? (
              <Text style={styles.mediaCount}>
                {spot.media[mediaIndex]?.mediaType === 'video' ? 'Video' : 'Photo'} {mediaIndex + 1} of{' '}
                {spot.media.length}
              </Text>
            ) : null}
            <ScrollView
              horizontal
              pagingEnabled
              decelerationRate="fast"
              snapToInterval={MEDIA_PAGE}
              snapToAlignment="start"
              disableIntervalMomentum
              showsHorizontalScrollIndicator={false}
              style={styles.mediaStrip}
              onMomentumScrollEnd={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
                const next = Math.round(e.nativeEvent.contentOffset.x / MEDIA_PAGE);
                setMediaIndex(Math.max(0, Math.min(next, spot.media.length - 1)));
              }}
            >
              {spot.media.map((item) => (
                <MediaItem key={item.id} item={item} />
              ))}
            </ScrollView>
          </>
        )}
        {isMine ? (
          <View style={styles.mediaButtons}>
            <View style={styles.mediaButton}>
              <Button
                title={addingMedia ? 'Uploading…' : 'Pick from library'}
                variant="secondary"
                onPress={() => void addMedia('library')}
                loading={addingMedia}
                disabled={addingMedia || spot.media.length >= MAX_MEDIA}
              />
            </View>
            <View style={styles.mediaButton}>
              <Button
                title="Take photo"
                variant="secondary"
                onPress={() => void addMedia('camera')}
                disabled={addingMedia || spot.media.length >= MAX_MEDIA}
              />
            </View>
          </View>
        ) : null}
      </View>

      {isMine ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Share with</Text>
          {groups.length === 0 ? (
            <Text style={styles.sectionText}>Join a group to share this pin.</Text>
          ) : (
            <>
              <Text style={styles.shareHint}>Tap a group to share or unshare. None selected = only you.</Text>
              <View style={styles.groupRow}>
                {groups.map((g) => {
                  const on = spot.groupIds.includes(g.id);
                  return (
                    <Pressable
                      key={g.id}
                      onPress={() => toggleShare(g.id)}
                      style={[
                        styles.groupChip,
                        on ? styles.groupChipActive : null,
                        sharing ? styles.groupChipBusy : null,
                      ]}
                    >
                      <Text style={[styles.groupChipText, on ? styles.groupChipTextActive : null]}>
                        {g.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}
        </View>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          onPress={() => setSendOpen(true)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Send"
          style={styles.sendWrap}
        >
          <Text style={styles.sendText}>Send</Text>
          <Ionicons name="paper-plane-outline" size={16} color={colors.primary} />
        </Pressable>
        {isMine ? (
          <Pressable
            onPress={confirmDelete}
            disabled={deleting}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Delete spot"
            style={styles.deleteWrap}
          >
            {deleting ? (
              <ActivityIndicator color={colors.textMuted} size="small" />
            ) : (
              <Text style={styles.deleteText}>Delete spot</Text>
            )}
          </Pressable>
        ) : (
          <Pressable
            onPress={onSpotSafety}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Report or block"
            style={styles.deleteWrap}
          >
            <Text style={styles.deleteText}>Report or block</Text>
          </Pressable>
        )}
      </View>
      <SendSpotSheet
        visible={sendOpen}
        groups={groups}
        sending={sending}
        onClose={() => {
          if (!sending) setSendOpen(false);
        }}
        onSend={(groupIds, body) => void sendToGroups(groupIds, body)}
      />
    </ScrollView>
  );
}

function MediaItem({ item }: { item: SpotMedia }) {
  if (item.mediaType === 'video') {
    return <VideoItem url={item.url} />;
  }
  return <Image source={{ uri: item.url }} style={styles.media} resizeMode="cover" />;
}

function VideoItem({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
  });
  return (
    <VideoView
      player={player}
      style={styles.media}
      contentFit="cover"
      nativeControls
    />
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.background,
    flex: 1,
  },
  content: {
    gap: spacing.md,
    padding: spacing.lg,
    paddingBottom: spacing.xl * 2,
  },
  center: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: 'center',
  },
  name: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
  },
  meta: {
    color: colors.textMuted,
    fontSize: 13,
  },
  section: {
    gap: spacing.xs,
  },
  sectionLabel: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  sectionText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  addressBlock: {
    gap: spacing.md,
  },
  addressSpinner: {
    alignSelf: 'flex-start',
    marginVertical: 6,
  },
  addressLang: {
    gap: 2,
  },
  addressLangLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  mapsRow: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: 6,
  },
  addressLink: {
    color: colors.selected,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
  },
  mediaStrip: {
    marginTop: spacing.xs,
  },
  mediaCount: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  media: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    height: MEDIA_HEIGHT,
    marginRight: spacing.sm,
    width: MEDIA_WIDTH,
  },
  mediaButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  mediaButton: {
    flex: 1,
  },
  shareHint: {
    color: colors.textMuted,
    fontSize: 14,
  },
  groupRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  groupChip: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.full,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  groupChipActive: {
    backgroundColor: colors.selected,
    borderColor: colors.selected,
  },
  groupChipBusy: {
    opacity: 0.55,
  },
  groupChipText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  groupChipTextActive: {
    color: colors.onSelected,
  },
  actions: {
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  sendWrap: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingVertical: spacing.sm,
  },
  sendText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  deleteWrap: {
    paddingVertical: spacing.sm,
  },
  deleteText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '500',
  },
});
