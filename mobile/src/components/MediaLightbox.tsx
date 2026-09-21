import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useEvent } from 'expo';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import {
  GestureHandlerRootView,
  PanGestureHandler,
  State,
  type PanGestureHandlerGestureEvent,
  type PanGestureHandlerStateChangeEvent,
} from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ChatMedia } from '../types';
import { colors } from '../theme';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const DISMISS_Y = 90;
const DISMISS_V = 900;

export type LightboxItem = ChatMedia & {
  messageId?: string;
  userId?: string;
  username?: string;
};

export function MediaLightbox({
  items,
  index,
  myId,
  onClose,
  onSafety,
}: {
  items: LightboxItem[] | null;
  index: number;
  myId?: string;
  onClose: () => void;
  onSafety?: (item: LightboxItem) => void;
}) {
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<LightboxItem>>(null);
  const onCloseRef = useRef(onClose);
  const dragY = useRef(new Animated.Value(0)).current;
  const open = items != null && items.length > 0;
  const [page, setPage] = useState(index);
  const [dragging, setDragging] = useState(false);

  onCloseRef.current = onClose;

  useEffect(() => {
    dragY.setValue(0);
    setPage(index);
    setDragging(false);
  }, [index, items, dragY]);

  const onGestureEvent = Animated.event<PanGestureHandlerGestureEvent>(
    [{ nativeEvent: { translationY: dragY } }],
    { useNativeDriver: true },
  );

  const onHandlerStateChange = (e: PanGestureHandlerStateChangeEvent) => {
    const { state, translationY, velocityY } = e.nativeEvent;
    if (state === State.BEGAN || state === State.ACTIVE) {
      setDragging(true);
      return;
    }
    if (state !== State.END && state !== State.CANCELLED && state !== State.FAILED) return;

    const shouldClose = translationY > DISMISS_Y || velocityY > DISMISS_V;
    if (shouldClose) {
      Animated.timing(dragY, {
        toValue: SCREEN_H,
        duration: 160,
        useNativeDriver: true,
      }).start(() => {
        dragY.setValue(0);
        setDragging(false);
        onCloseRef.current();
      });
      return;
    }
    setDragging(false);
    Animated.spring(dragY, {
      toValue: 0,
      bounciness: 3,
      useNativeDriver: true,
    }).start();
  };

  const translateY = dragY.interpolate({
    inputRange: [-1, 0, SCREEN_H],
    outputRange: [0, 0, SCREEN_H],
    extrapolate: 'clamp',
  });
  const bgOpacity = dragY.interpolate({
    inputRange: [0, 260],
    outputRange: [1, 0.25],
    extrapolate: 'clamp',
  });
  const scale = dragY.interpolate({
    inputRange: [0, SCREEN_H],
    outputRange: [1, 0.88],
    extrapolate: 'clamp',
  });
  const chromeOpacity = dragY.interpolate({
    inputRange: [0, 80],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  if (!open || !items) return null;

  const current = items[Math.max(0, Math.min(page, items.length - 1))];
  const canReport = Boolean(
    onSafety && current?.userId && current.userId !== myId && current.messageId,
  );

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={styles.fill}>
        <Animated.View style={[styles.root, { opacity: bgOpacity }]}>
          <PanGestureHandler
            activeOffsetY={12}
            failOffsetX={[-18, 18]}
            onGestureEvent={onGestureEvent}
            onHandlerStateChange={onHandlerStateChange}
          >
            <Animated.View style={{ flex: 1, transform: [{ translateY }, { scale }] }}>
              <FlatList
                ref={listRef}
                data={items}
                horizontal
                pagingEnabled
                scrollEnabled={!dragging}
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
                      i === page ? (
                        <LightboxVideo url={item.url} active={!dragging} />
                      ) : (
                        <View style={styles.mediaWrap} />
                      )
                    ) : (
                      <LightboxPhoto url={item.url} />
                    )}
                  </View>
                )}
              />
            </Animated.View>
          </PanGestureHandler>
          <Animated.View
            style={[styles.chrome, { opacity: chromeOpacity, paddingTop: Math.max(insets.top, 12) }]}
            pointerEvents={dragging ? 'none' : 'box-none'}
          >
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
            {canReport ? (
              <Pressable
                onPress={() => current && onSafety?.(current)}
                hitSlop={12}
                style={styles.close}
                accessibilityLabel="Report or block"
              >
                <Ionicons name="flag-outline" size={22} color="#fff" />
              </Pressable>
            ) : (
              <View style={styles.close} />
            )}
          </Animated.View>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

function LightboxPhoto({ url }: { url: string }) {
  const [loading, setLoading] = useState(true);
  return (
    <View style={styles.mediaWrap}>
      <Image
        source={{ uri: url }}
        style={styles.photo}
        resizeMode="contain"
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
      />
      {loading ? (
        <View style={styles.spinner} pointerEvents="none">
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : null}
    </View>
  );
}

function LightboxVideo({ url, active }: { url: string; active: boolean }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
  });
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const loading = status !== 'readyToPlay' && status !== 'error';

  useEffect(() => {
    if (active) {
      void player.play();
    } else {
      player.pause();
    }
  }, [active, player]);

  useEffect(() => {
    return () => {
      player.pause();
    };
  }, [player]);

  return (
    <Pressable
      style={styles.mediaWrap}
      onPress={() => {
        if (player.playing) player.pause();
        else void player.play();
      }}
    >
      <View pointerEvents="none" style={styles.photo}>
        <VideoView
          player={player}
          style={styles.photo}
          contentFit="contain"
          nativeControls={false}
        />
      </View>
      {loading ? (
        <View style={styles.spinner} pointerEvents="none">
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : null}
      {!loading && !isPlaying ? (
        <View style={styles.playBadge} pointerEvents="none">
          <Ionicons name="play" size={44} color="#fff" />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
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
  mediaWrap: {
    height: SCREEN_H,
    width: SCREEN_W,
  },
  photo: {
    height: SCREEN_H,
    width: SCREEN_W,
  },
  spinner: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBadge: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
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
