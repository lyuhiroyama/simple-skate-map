import React, { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { PrivacyCopy } from './LegalScreen';
import { colors, radius, spacing } from '../theme';

export function SignInScreen() {
  const { signInWithApple, signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState<'apple' | 'google' | null>(null);
  const [privacyOpen, setPrivacyOpen] = useState(false);

  const run = async (provider: 'apple' | 'google') => {
    if (busy) return;
    setBusy(provider);
    const error = provider === 'apple' ? await signInWithApple() : await signInWithGoogle();
    setBusy(null);
    if (error) {
      Alert.alert('Could not sign in', error);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.hero}>
        <Text style={styles.logo}>Simple Skate Map</Text>
        <Text style={styles.tagline}>Document the places you admire.</Text>
      </View>

      <View style={styles.actions}>
        {/* Expo Go SDK 57 dropped the native Apple button view manager. */}
        <Pressable
          onPress={() => run('apple')}
          disabled={busy !== null}
          style={({ pressed }) => [styles.appleButton, { opacity: pressed || busy ? 0.8 : 1 }]}
        >
          <Text style={styles.appleButtonText}>Continue with Apple</Text>
        </Pressable>

        <Pressable
          onPress={() => run('google')}
          disabled={busy !== null}
          style={({ pressed }) => [styles.googleButton, { opacity: pressed || busy ? 0.8 : 1 }]}
        >
          <Text style={styles.googleText}>Continue with Google</Text>
        </Pressable>

        <Text style={styles.hint}>No passwords. You stay signed in on this phone.</Text>
        <Text style={styles.disclaimer}>
          For looking at spots and clips. Not a guidebook. Don't trespass.
        </Text>
        <Pressable onPress={() => setPrivacyOpen(true)} hitSlop={8} accessibilityRole="button">
          <Text style={styles.privacyLink}>Privacy</Text>
        </Pressable>
      </View>

      <Modal
        visible={privacyOpen}
        animationType="slide"
        onRequestClose={() => setPrivacyOpen(false)}
      >
        <View style={styles.privacyModal}>
          <Text style={styles.privacyTitle}>Privacy</Text>
          <ScrollView contentContainerStyle={styles.privacyScroll}>
            <PrivacyCopy />
          </ScrollView>
          <Pressable onPress={() => setPrivacyOpen(false)} style={styles.privacyClose}>
            <Text style={styles.privacyCloseText}>Close</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl * 2,
  },
  hero: {
    flex: 1,
    justifyContent: 'center',
  },
  logo: {
    color: colors.primary,
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 0.4,
    textAlign: 'center',
  },
  tagline: {
    color: colors.textMuted,
    fontSize: 15,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  actions: {
    gap: spacing.sm,
    paddingBottom: spacing.lg,
  },
  appleButton: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: radius.md,
    height: 50,
    justifyContent: 'center',
    width: '100%',
  },
  appleButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
  googleButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    height: 50,
    justifyContent: 'center',
  },
  googleText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  hint: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  disclaimer: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  privacyLink: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  privacyModal: {
    backgroundColor: colors.background,
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl * 2,
  },
  privacyTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
    marginBottom: spacing.md,
  },
  privacyScroll: {
    paddingBottom: spacing.xl,
  },
  privacyClose: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  privacyCloseText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '700',
  },
});
