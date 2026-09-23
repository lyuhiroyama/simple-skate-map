import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../lib/api';
import { hapticClick } from '../lib/haptics';
import { afterDismiss, blockedNotice, confirmBlock, showReportBlockSheet } from '../lib/safety';
import { useAuth } from '../context/AuthContext';
import { chatMediaOf } from '../types';
import type { RootStackScreenProps } from '../navigation/types';
import { colors, spacing } from '../theme';
import { MediaLightbox, type LightboxItem } from '../components/MediaLightbox';

const GAP = 2;
const COLS = 3;
const TILE = Math.floor((Dimensions.get('window').width - GAP * (COLS - 1)) / COLS);

type MediaTile = {
  key: string;
  messageId: string;
  userId: string;
  username: string;
  url: string;
  mediaType: 'photo' | 'video';
};

export function GroupMediaScreen({ route }: RootStackScreenProps<'GroupMedia'>) {
  const { groupId } = route.params;
  const { session } = useAuth();
  const [items, setItems] = useState<MediaTile[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const myId = session?.user.id;
  const lightboxItems: LightboxItem[] = items.map((item) => ({
    url: item.url,
    mediaType: item.mediaType,
    messageId: item.messageId,
    userId: item.userId,
    username: item.username,
  }));

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      api
        .getMessages(groupId)
        .then(({ messages }) => {
          if (cancelled) return;
          setItems(
            messages.flatMap((m) =>
              chatMediaOf(m).map((media, index) => ({
                key: `${m.id}-${index}`,
                messageId: m.id,
                userId: m.userId,
                username: m.username,
                url: media.url,
                mediaType: media.mediaType,
              })),
            ),
          );
        })
        .catch((e: unknown) => {
          if (!cancelled) {
            Alert.alert('Could not load media', e instanceof Error ? e.message : 'Unknown error');
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [groupId]),
  );

  const empty = useMemo(
    () =>
      loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <Text style={styles.empty}>No photos or videos in this chat yet.</Text>
      ),
    [loading],
  );

  const onTileSafety = (item: MediaTile) => {
    if (item.userId === myId) return;
    showReportBlockSheet({
      onReport: async (reason) => {
        try {
          await api.report({ contentType: 'message', contentId: item.messageId, reason });
          setItems((prev) => prev.filter((m) => m.messageId !== item.messageId));
          setLightboxIndex(null);
          Alert.alert('Reported', 'Thanks. You will not see this.');
        } catch (e) {
          Alert.alert('Could not report', e instanceof Error ? e.message : 'Unknown error');
        }
      },
      onBlock: () =>
        confirmBlock(item.username, async () => {
          try {
            await api.blockUser(item.userId);
            setItems((prev) => prev.filter((m) => m.userId !== item.userId));
            setLightboxIndex(null);
            blockedNotice();
          } catch (e) {
            Alert.alert('Could not block', e instanceof Error ? e.message : 'Unknown error');
          }
        }),
    });
  };

  return (
    <>
      <FlatList
        style={styles.root}
        data={items}
        numColumns={COLS}
        keyExtractor={(m) => m.key}
        ListEmptyComponent={empty}
        renderItem={({ item, index }) => (
          <Pressable
            style={styles.tile}
            onPress={() => setLightboxIndex(index)}
            onLongPress={() => {
              hapticClick();
              onTileSafety(item);
            }}
            delayLongPress={400}
          >
            {item.mediaType === 'video' ? (
              <VideoThumb url={item.url} />
            ) : (
              <Image source={{ uri: item.url }} style={styles.image} />
            )}
          </Pressable>
        )}
      />
      <MediaLightbox
        items={lightboxIndex == null ? null : lightboxItems}
        index={lightboxIndex ?? 0}
        myId={myId}
        onClose={() => setLightboxIndex(null)}
        onSafety={(target) => {
          const tile = items.find((item) => item.messageId === target.messageId && item.url === target.url);
          setLightboxIndex(null);
          if (tile) afterDismiss(() => onTileSafety(tile));
        }}
      />
    </>
  );
}

function VideoThumb({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
  });
  return (
    <View style={styles.image} pointerEvents="none">
      <VideoView player={player} style={styles.image} contentFit="cover" nativeControls={false} />
      <View style={styles.playBadge} pointerEvents="none">
        <Ionicons name="play" size={18} color="#fff" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.background,
    flex: 1,
  },
  empty: {
    color: colors.textMuted,
    fontSize: 14,
    padding: spacing.lg,
    textAlign: 'center',
  },
  loading: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  tile: {
    height: TILE,
    marginBottom: GAP,
    marginRight: GAP,
    width: TILE,
  },
  image: {
    backgroundColor: colors.surface,
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
});
