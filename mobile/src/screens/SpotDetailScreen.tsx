import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Button, EmptyState } from '../components/ui';
import type { SpotDetail, SpotMedia } from '../types';
import type { RootStackScreenProps } from '../navigation/types';
import { colors, radius, spacing } from '../theme';

const MEDIA_WIDTH = Dimensions.get('window').width - spacing.lg * 2;
const MEDIA_HEIGHT = Math.round(MEDIA_WIDTH * 0.75);

export function SpotDetailScreen({ route, navigation }: RootStackScreenProps<'SpotDetail'>) {
  const { spotId } = route.params;
  const { session } = useAuth();
  const [spot, setSpot] = useState<SpotDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      api
        .getSpot(spotId)
        .then(({ spot: s }) => {
          if (!cancelled) setSpot(s);
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
        <Text style={styles.sectionLabel}>
          Photos & videos {spot.media.length > 0 ? `(${spot.media.length})` : ''}
        </Text>
        {spot.media.length === 0 ? (
          <Text style={styles.sectionText}>No media yet.</Text>
        ) : (
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            style={styles.mediaStrip}
          >
            {spot.media.map((item) => (
              <MediaItem key={item.id} item={item} />
            ))}
          </ScrollView>
        )}
      </View>

      {isMine ? (
        <Button title="Delete spot" variant="danger" onPress={confirmDelete} loading={deleting} />
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
  media: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    height: MEDIA_HEIGHT,
    marginRight: spacing.sm,
    width: MEDIA_WIDTH,
  },
});
