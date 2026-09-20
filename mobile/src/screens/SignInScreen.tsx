import * as AppleAuthentication from 'expo-apple-authentication';
import React, { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { colors, radius, spacing } from '../theme';

export function SignInScreen() {
  const { signInWithApple, signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState<'apple' | 'google' | null>(null);

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
        <Text style={styles.logo}>MR. CLIPPED UP</Text>
        <Text style={styles.tagline}>Share spots. Get clipped up.</Text>
      </View>

      <View style={styles.actions}>
        {Platform.OS === 'ios' ? (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
            cornerRadius={radius.md}
            style={styles.appleButton}
            onPress={() => run('apple')}
          />
        ) : (
          <Pressable
            onPress={() => run('apple')}
            disabled={busy !== null}
            style={({ pressed }) => [styles.appleWeb, { opacity: pressed || busy ? 0.8 : 1 }]}
          >
            <Text style={styles.appleWebText}>Continue with Apple</Text>
          </Pressable>
        )}

        <Pressable
          onPress={() => run('google')}
          disabled={busy !== null}
          style={({ pressed }) => [styles.googleButton, { opacity: pressed || busy ? 0.8 : 1 }]}
        >
          <Text style={styles.googleText}>Continue with Google</Text>
        </Pressable>

        <Text style={styles.hint}>No passwords. You stay signed in on this phone.</Text>
      </View>
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
    letterSpacing: 1,
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
    height: 50,
    width: '100%',
  },
  appleWeb: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: radius.md,
    height: 50,
    justifyContent: 'center',
  },
  appleWebText: {
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
});
