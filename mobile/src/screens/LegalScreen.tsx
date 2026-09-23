import React, { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui';
import { PRIVACY_SECTIONS } from '../legal';
import type { BlockedUser } from '../types';
import type { RootStackScreenProps } from '../navigation/types';
import { colors, spacing } from '../theme';

export function PrivacyCopy() {
  return (
    <View style={styles.sections}>
      {PRIVACY_SECTIONS.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          <Text style={styles.sectionBody}>{section.body}</Text>
        </View>
      ))}
    </View>
  );
}

export function LegalScreen({}: RootStackScreenProps<'Legal'>) {
  const { signOut } = useAuth();
  const [blocks, setBlocks] = useState<BlockedUser[]>([]);
  const [deleting, setDeleting] = useState(false);

  const loadBlocks = useCallback(async () => {
    try {
      const { blocks: next } = await api.getBlocks();
      setBlocks(next);
    } catch (e) {
      Alert.alert('Could not load blocked people', e instanceof Error ? e.message : 'Unknown error');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadBlocks();
    }, [loadBlocks]),
  );

  const unblock = (person: BlockedUser) => {
    Alert.alert(`Unblock ${person.username}?`, 'Their messages and spots can show up again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unblock',
        onPress: async () => {
          try {
            await api.unblockUser(person.userId);
            setBlocks((prev) => prev.filter((b) => b.userId !== person.userId));
          } catch (e) {
            Alert.alert('Could not unblock', e instanceof Error ? e.message : 'Unknown error');
          }
        },
      },
    ]);
  };

  const deleteAccount = () => {
    Alert.alert(
      'Delete account?',
      'Your login is removed. Messages and spots stay visible to others as Deleted Account. Groups you own go to another member if one is left.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            Alert.alert('Are you sure?', 'This cannot be undone.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete my account',
                style: 'destructive',
                onPress: async () => {
                  setDeleting(true);
                  try {
                    await api.deleteMe();
                  } catch (e) {
                    setDeleting(false);
                    Alert.alert(
                      'Could not delete account',
                      e instanceof Error ? e.message : 'Unknown error',
                    );
                    return;
                  }
                  await signOut();
                },
              },
            ]);
          },
        },
      ],
    );
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>Blocked accounts</Text>
      <Text style={styles.sectionBody}>
        People you block are hidden from your chats and map. Unblock them here.
      </Text>
      {blocks.length === 0 ? (
        <Text style={styles.emptyBlocks}>You have not blocked anyone.</Text>
      ) : (
        blocks.map((person) => (
          <View key={person.userId} style={styles.blockRow}>
            <Text style={styles.blockName}>{person.username}</Text>
            <Pressable
              onPress={() => unblock(person)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Unblock ${person.username}`}
              style={styles.unblockBtn}
            >
              <Text style={styles.unblock}>Unblock</Text>
            </Pressable>
          </View>
        ))
      )}

      <Text style={styles.kicker}>Account</Text>
      <Button
        title={deleting ? 'Deleting…' : 'Delete account'}
        variant="danger"
        onPress={deleteAccount}
        loading={deleting}
        disabled={deleting}
      />

      <Text style={styles.kicker}>Privacy</Text>
      <PrivacyCopy />
    </ScrollView>
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
    paddingBottom: spacing.xl * 3,
  },
  sections: {
    gap: spacing.md,
  },
  kicker: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
    marginTop: spacing.sm,
    textTransform: 'uppercase',
  },
  section: {
    gap: spacing.xs,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  sectionBody: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
  },
  emptyBlocks: {
    color: colors.textMuted,
    fontSize: 15,
  },
  blockRow: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  blockName: {
    color: colors.text,
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    marginRight: 12,
  },
  unblockBtn: {
    paddingVertical: 4,
  },
  unblock: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
});
