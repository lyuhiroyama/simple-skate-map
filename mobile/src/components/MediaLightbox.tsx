import React, { useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ChatMedia } from '../types';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export function MediaLightbox({
  items,
  index,
  onClose,
}: {
  items: ChatMedia[] | null;
  index: number;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<ChatMedia>>(null);
  const open = items != null && items.length > 0;
  const [page, setPage] = useState(index);

  useEffect(() => {
    setPage(index);
  }, [index, items]);

  if (!open || !items) return null;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <FlatList
          ref={listRef}
          data={items}
          horizontal
          pagingEnabled
          initialScrollIndex={Math.min(index, items.length - 1)}
          getItemLayout={(_, i) => ({ length: SCREEN_W, offset: SCREEN_W * i, index: i })}
          keyExtractor={(item, i) => `${item.url}-${i}`}
          onMomentumScrollEnd={(e) => {
            const next = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
            setPage(Math.max(0, Math.min(next, items.length - 1)));
          }}
          onScrollToIndexFailed={({ index: failed }) => {
            requestAnimationFrame(() => {
              listRef.current?.scrollToIndex({ index: failed, animated: false });
            });
          }}
          renderItem={({ item, index: i }) => (
            <View style={styles.page}>
              {item.mediaType === 'video' ? (
                <LightboxVideo url={item.url} active={i === page} />
              ) : (
                <Image source={{ uri: item.url }} style={styles.photo} resizeMode="contain" />
              )}
            </View>
          )}
        />
        <View style={[styles.chrome, { paddingTop: Math.max(insets.top, 12) }]}>
          <Pressable onPress={onClose} hitSlop={12} style={styles.close} accessibilityLabel="Close">
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
          {items.length > 1 ? (
            <Text style={styles.count}>
              {page + 1} of {items.length}
            </Text>
          ) : (
            <View style={styles.countSpacer} />
          )}
          <View style={styles.close} />
        </View>
      </View>
    </Modal>
  );
}

function LightboxVideo({ url, active }: { url: string; active: boolean }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
  });

  useEffect(() => {
    if (active) {
      void player.play();
    } else {
      player.pause();
    }
  }, [active, player]);

  return (
    <VideoView
      player={player}
      style={styles.photo}
      contentFit="contain"
      nativeControls
    />
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: '#000',
    flex: 1,
  },
  page: {
    alignItems: 'center',
    height: SCREEN_H,
    justifyContent: 'center',
    width: SCREEN_W,
  },
  photo: {
    height: SCREEN_H,
    width: SCREEN_W,
  },
  chrome: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: 0,
    paddingHorizontal: 12,
    paddingBottom: 12,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  close: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  count: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  countSpacer: {
    width: 44,
  },
});
