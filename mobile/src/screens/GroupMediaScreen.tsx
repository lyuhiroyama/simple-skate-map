import React, { useCallback, useState } from 'react';
import {
  Alert,
  Dimensions,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../lib/api';
import type { ChatMessage } from '../types';
import type { RootStackScreenProps } from '../navigation/types';
import { colors, spacing } from '../theme';

const GAP = 2;
const COLS = 3;
const TILE = Math.floor((Dimensions.get('window').width - GAP * (COLS - 1)) / COLS);

export function GroupMediaScreen({ route }: RootStackScreenProps<'GroupMedia'>) {
  const { groupId } = route.params;
  const [items, setItems] = useState<ChatMessage[]>([]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      api
        .getMessages(groupId)
        .then(({ messages }) => {
          if (!cancelled) setItems(messages.filter((m) => m.imageUrl));
        })
        .catch((e: unknown) => {
          if (!cancelled) {
            Alert.alert('Could not load media', e instanceof Error ? e.message : 'Unknown error');
          }
        });
      return () => {
        cancelled = true;
      };
    }, [groupId]),
  );

  return (
    <FlatList
      style={styles.root}
      data={items}
      numColumns={COLS}
      keyExtractor={(m) => m.id}
      ListEmptyComponent={<Text style={styles.empty}>No photos in this chat yet.</Text>}
      renderItem={({ item }) => (
        <Pressable style={styles.tile}>
          <Image source={{ uri: item.imageUrl }} style={styles.image} />
        </Pressable>
      )}
    />
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
});
