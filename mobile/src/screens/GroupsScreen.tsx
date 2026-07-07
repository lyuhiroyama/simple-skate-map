import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Button, EmptyState, Field } from '../components/ui';
import type { Group } from '../types';
import type { RootStackParamList } from '../navigation/types';
import { colors, radius, spacing } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function GroupsScreen() {
  const navigation = useNavigation<Nav>();
  const { signOut } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { groups: g } = await api.getGroups();
      setGroups(g);
    } catch (e) {
      Alert.alert('Could not load groups', e instanceof Error ? e.message : 'Unknown error');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const createGroup = async () => {
    if (!newGroupName.trim()) return;
    setBusy(true);
    try {
      await api.createGroup(newGroupName.trim());
      setNewGroupName('');
      await load();
    } catch (e) {
      Alert.alert('Could not create group', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  const joinGroup = async () => {
    if (!inviteCode.trim()) return;
    setBusy(true);
    try {
      const { group } = await api.joinGroup(inviteCode.trim());
      setInviteCode('');
      await load();
      Alert.alert('You are in!', `Joined "${group.name}".`);
    } catch (e) {
      Alert.alert('Could not join', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <FlatList
      style={styles.root}
      contentContainerStyle={styles.content}
      data={groups}
      keyExtractor={(g) => g.id}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />
      }
      ListHeaderComponent={
        <View style={styles.header}>
          <View style={styles.formRow}>
            <View style={styles.formField}>
              <Field
                label="New crew"
                value={newGroupName}
                onChangeText={setNewGroupName}
                placeholder="e.g. Downtown Shredders"
              />
            </View>
            <View style={styles.formButton}>
              <Button title="Create" onPress={createGroup} loading={busy} />
            </View>
          </View>
          <View style={styles.formRow}>
            <View style={styles.formField}>
              <Field
                label="Join with invite code"
                value={inviteCode}
                onChangeText={setInviteCode}
                autoCapitalize="none"
                placeholder="e.g. a1b2c3d4"
              />
            </View>
            <View style={styles.formButton}>
              <Button title="Join" variant="secondary" onPress={joinGroup} loading={busy} />
            </View>
          </View>
          <Text style={styles.sectionTitle}>Your crews</Text>
        </View>
      }
      ListEmptyComponent={
        <EmptyState
          title="No crews yet"
          subtitle="Create one above, or join with a friend's invite code."
        />
      }
      renderItem={({ item }) => (
        <Pressable
          style={styles.card}
          onPress={() =>
            navigation.navigate('GroupDetail', { groupId: item.id, groupName: item.name })
          }
        >
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>{item.name}</Text>
            <Text style={styles.cardMeta}>
              {item.memberCount} member{item.memberCount === 1 ? '' : 's'} ·{' '}
              {item.myRole === 'owner' ? 'you own this crew' : 'member'}
            </Text>
          </View>
          <Text style={styles.cardChevron}>›</Text>
        </Pressable>
      )}
      ListFooterComponent={
        <View style={styles.footer}>
          <Button title="Sign out" variant="secondary" onPress={() => signOut()} />
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.background,
    flex: 1,
  },
  content: {
    gap: spacing.sm,
    padding: spacing.lg,
    paddingBottom: spacing.xl * 2,
  },
  header: {
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  formRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  formField: {
    flex: 1,
  },
  formButton: {
    width: 96,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    marginTop: spacing.sm,
  },
  card: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    padding: spacing.md,
  },
  cardBody: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  cardMeta: {
    color: colors.textMuted,
    fontSize: 13,
  },
  cardChevron: {
    color: colors.textMuted,
    fontSize: 24,
  },
  footer: {
    marginTop: spacing.lg,
  },
});
