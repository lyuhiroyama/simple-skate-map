import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Share, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../lib/api';
import { Button, EmptyState } from '../components/ui';
import type { Group, GroupMember } from '../types';
import type { RootStackScreenProps } from '../navigation/types';
import { colors, radius, spacing } from '../theme';

export function GroupDetailScreen({ route, navigation }: RootStackScreenProps<'GroupDetail'>) {
  const { groupId } = route.params;
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      Promise.all([api.getGroups(), api.getGroupMembers(groupId)])
        .then(([groupsRes, membersRes]) => {
          if (cancelled) return;
          setGroup(groupsRes.groups.find((g) => g.id === groupId) ?? null);
          setMembers(membersRes.members);
        })
        .catch((e: unknown) => {
          Alert.alert('Could not load crew', e instanceof Error ? e.message : 'Unknown error');
        });
      return () => {
        cancelled = true;
      };
    }, [groupId]),
  );

  const shareInvite = async () => {
    if (!group) return;
    await Share.share({
      message: `Join my skate crew "${group.name}" on Skate Spots! Invite code: ${group.inviteCode}`,
    });
  };

  const leave = () => {
    Alert.alert('Leave crew?', 'You will stop seeing its spots on your map.', [
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
  };

  return (
    <FlatList
      style={styles.root}
      contentContainerStyle={styles.content}
      data={members}
      keyExtractor={(m) => m.userId}
      ListHeaderComponent={
        <View style={styles.header}>
          {group ? (
            <View style={styles.inviteCard}>
              <Text style={styles.inviteLabel}>Invite code</Text>
              <Text style={styles.inviteCode}>{group.inviteCode}</Text>
              <Button title="Share invite" onPress={shareInvite} />
            </View>
          ) : null}
          <Text style={styles.sectionTitle}>Members</Text>
        </View>
      }
      ListEmptyComponent={<EmptyState title="Loading members..." />}
      renderItem={({ item }) => (
        <View style={styles.memberRow}>
          <Text style={styles.memberName}>{item.username}</Text>
          <Text style={styles.memberRole}>{item.role}</Text>
        </View>
      )}
      ListFooterComponent={
        <View style={styles.footer}>
          <Button title="Leave crew" variant="danger" onPress={leave} />
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
  inviteCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  inviteLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  inviteCode: {
    color: colors.primary,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 4,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  memberRow: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  memberName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  memberRole: {
    color: colors.textMuted,
    fontSize: 13,
    textTransform: 'uppercase',
  },
  footer: {
    marginTop: spacing.lg,
  },
});
