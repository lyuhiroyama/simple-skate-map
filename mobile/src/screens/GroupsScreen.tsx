import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [username, setUsername] = useState('');
  const [usernameDraft, setUsernameDraft] = useState('');
  const [usernameOpen, setUsernameOpen] = useState(false);
  const [savingUsername, setSavingUsername] = useState(false);

  const load = useCallback(async () => {
    try {
      const [{ groups: g }, me] = await Promise.all([api.getGroups(), api.getMe()]);
      setGroups(g);
      setUsername(me.profile.username);
    } catch (e) {
      Alert.alert('Could not load groups', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
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

  const openUsername = () => {
    setUsernameDraft(username);
    setUsernameOpen(true);
  };

  const saveUsername = async () => {
    const next = usernameDraft.trim();
    if (next.length < 2 || next.length > 32 || !/^[a-zA-Z0-9_]+$/.test(next)) {
      Alert.alert('Invalid username', 'Use 2–32 letters, numbers, and underscores.');
      return;
    }
    setSavingUsername(true);
    try {
      const { profile } = await api.updateUsername(next);
      setUsername(profile.username);
      setUsernameOpen(false);
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSavingUsername(false);
    }
  };

  return (
    <>
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
          <Field
            label="Group name"
            value={newGroupName}
            onChangeText={setNewGroupName}
            placeholder="e.g. Tokyo Locals"
          />
          <Button title="Create group" onPress={createGroup} loading={busy} />
          <Field
            label="Invite code"
            value={inviteCode}
            onChangeText={setInviteCode}
            autoCapitalize="none"
            placeholder="e.g. TOKYO1"
          />
          <Button title="Join group" variant="secondary" onPress={joinGroup} loading={busy} />
          <View style={styles.sectionTitleRow}>
            <Ionicons name="chatbubble-outline" size={20} color={colors.text} />
            <Text style={styles.sectionTitle}>Groups</Text>
          </View>
        </View>
      }
      ListEmptyComponent={
        loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <EmptyState
            title="No groups yet"
            subtitle="Create one above, or join with an invite code."
          />
        )
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
              {item.myRole === 'owner' ? 'you own this group' : 'member'}
            </Text>
          </View>
        </Pressable>
      )}
      ListFooterComponent={
        <View style={styles.footer}>
          <View style={styles.footerRow}>
            <Pressable
              onPress={openUsername}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Username"
              style={styles.footerBtn}
            >
              <Text style={styles.footerBtnText}>Username</Text>
            </Pressable>
            <Pressable
              onPress={() =>
                Alert.alert('Sign out?', 'You will need to sign in again to use the app.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
                ])
              }
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Sign out"
              style={styles.footerBtn}
            >
              <Text style={styles.footerBtnText}>Sign out</Text>
            </Pressable>
          </View>
          <Pressable
            onPress={() => navigation.navigate('Legal')}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Privacy and account"
            style={styles.footerBtn}
          >
            <Text style={styles.footerBtnText}>Privacy & account</Text>
          </Pressable>
        </View>
      }
    />
    <Modal
      visible={usernameOpen}
      transparent
      animationType="fade"
      onRequestClose={() => setUsernameOpen(false)}
    >
      <View style={styles.dialogBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setUsernameOpen(false)} />
        <View style={styles.dialog}>
          <Text style={styles.dialogTitle}>Username</Text>
          <Text style={styles.dialogBody}>This is what people in your groups will see.</Text>
          <Field
            value={usernameDraft}
            onChangeText={setUsernameDraft}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="e.g. lyu"
            maxLength={32}
          />
          <Button title="Save" onPress={saveUsername} loading={savingUsername} />
          <Button title="Cancel" variant="secondary" onPress={() => setUsernameOpen(false)} />
        </View>
      </View>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.background,
    flex: 1,
  },
  content: {
    flexGrow: 1,
    gap: spacing.sm,
    padding: spacing.lg,
    paddingBottom: spacing.xl * 3,
  },
  header: {
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  sectionTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  loading: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
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
  footer: {
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 'auto',
    paddingTop: spacing.xl * 2,
  },
  footerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.lg,
    justifyContent: 'center',
  },
  footerBtn: {
    paddingVertical: spacing.sm,
  },
  footerBtnText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '500',
  },
  dialogBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  dialog: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
    width: '100%',
  },
  dialogTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  dialogBody: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
});
