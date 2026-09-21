import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useEvent } from 'expo';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ChatMedia } from '../types';
import { colors } from '../theme';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const DISMISS_Y = 120;
const DISMISS_V = 1.15;

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
  const translateY = useRef(new Animated.Value(0)).current;
  const open = items != null && items.length > 0;
  const [page, setPage] = useState(index);
  const [dragging, setDragging] = useState(false);

  onCloseRef.current = onClose;

  useEffect(() => {
    translateY.setValue(0);
    setPage(index);
    setDragging(false);
  }, [index, items, translateY]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, g) =>
          g.dy > 10 && g.dy > Math.abs(g.dx) * 1.3,
        onMoveShouldSetPanResponder: (_, g) => g.dy > 10 && g.dy > Math.abs(g.dx) * 1.3,
        onPanResponderGrant: () => setDragging(true),
        onPanResponderMove: (_, g) => {
          translateY.setValue(Math.max(0, g.dy));
        },
        onPanResponderRelease: (_, g) => {
          const shouldClose = g.dy > DISMISS_Y || g.vy > DISMISS_V;
          if (shouldClose) {
            Animated.timing(translateY, {
              toValue: SCREEN_H,
              duration: 180,
              useNativeDriver: true,
            }).start(() => {
              translateY.setValue(0);
              setDragging(false);
              onCloseRef.current();
            });
            return;
          }
          setDragging(false);
          Animated.spring(translateY, {
            toValue: 0,
            bounciness: 3,
            useNativeDriver: true,
          }).start();
        },
        onPanResponderTerminate: () => {
          setDragging(false);
          Animated.spring(translateY, {
            toValue: 0,
            bounciness: 3,
            useNativeDriver: true,
          }).start();
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [translateY],
  );

  const bgOpacity = translateY.interpolate({
    inputRange: [0, 260],
    outputRange: [1, 0.25],
    extrapolate: 'clamp',
  });
  const scale = translateY.interpolate({
    inputRange: [0, SCREEN_H],
    outputRange: [1, 0.88],
    extrapolate: 'clamp',
  });
  const chromeOpacity = translateY.interpolate({
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
      <Animated.View style={[styles.root, { opacity: bgOpacity }]} {...pan.panHandlers}>
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
                  <LightboxVideo url={item.url} active={i === page && !dragging} />
                ) : (
                  <LightboxPhoto url={item.url} />
                )}
              </View>
            )}
          />
        </Animated.View>
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
        onLoad={() => setLoading(false)}
        onError={() => setLoading(false)}
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
  const loading = status !== 'readyToPlay' && status !== 'error';

  useEffect(() => {
    if (active) {
      void player.play();
    } else {
      player.pause();
    }
  }, [active, player]);

  return (
    <View style={styles.mediaWrap}>
      <VideoView player={player} style={styles.photo} contentFit="contain" nativeControls />
      {loading ? (
        <View style={styles.spinner} pointerEvents="none">
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : null}
    </View>
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
