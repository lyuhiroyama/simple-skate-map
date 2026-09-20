import React, { useCallback, useState } from 'react';
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
import { useVideoPlayer, VideoView } from 'expo-video';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { EmptyState } from '../components/ui';
import type { SpotDetail, SpotMedia } from '../types';
import type { RootStackScreenProps } from '../navigation/types';
import { colors, radius, spacing } from '../theme';

const MEDIA_WIDTH = Dimensions.get('window').width - spacing.lg * 2;
const MEDIA_HEIGHT = Math.round(MEDIA_WIDTH * 0.75);
const MEDIA_PAGE = MEDIA_WIDTH + spacing.sm;

export function SpotDetailScreen({ route, navigation }: RootStackScreenProps<'SpotDetail'>) {
  const { spotId } = route.params;
  const { session } = useAuth();
  const [spot, setSpot] = useState<SpotDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [mediaIndex, setMediaIndex] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      api
        .getSpot(spotId)
        .then(({ spot: s }) => {
          if (!cancelled) {
            setSpot(s);
            setMediaIndex(0);
          }
        })
        .catch((e: unknown) => {
          if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load spot');
        });
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
            Alert.alert('Delete failed', e instanceof Error ? e.message : 'Unknown error');
          }
        },
      },
    ]);
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

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.name}>{spot.name}</Text>
      <Text style={styles.meta}>
        added by {spot.createdByUsername} · {new Date(spot.createdAt).toLocaleDateString()}
      </Text>

      {spot.address ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Address</Text>
          <Text style={styles.sectionText}>{spot.address}</Text>
        </View>
      ) : null}

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
      </View>

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
      ) : null}
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
  deleteWrap: {
    alignSelf: 'center',
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
  },
  deleteText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '500',
  },
});
